/**
 * 個別相談 予約システム（Google Apps Script）
 *
 * - 公開URLを開くと、空いている枠だけが表示される
 * - Googleカレンダーに予定がある時間帯は自動的に予約不可
 * - 予約が入るとカレンダーに予定を作成し、お客様と自分に確認メールを送る
 *
 * 設定はこの CONFIG だけを書き換えればOK。
 */
const CONFIG = {
  // 予約を書き込むカレンダー（'primary' = 自分のメインカレンダー）
  BOOKING_CALENDAR_ID: 'primary',

  // 空き判定に使うカレンダー（仕事用・家族用など、予定を見たいものを全部並べる）
  CHECK_CALENDAR_IDS: ['primary'],

  // 枠の開始時刻（毎日）と1枠の長さ（分）
  SLOT_START_TIMES: ['10:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30'],
  SLOT_MINUTES: 90,

  // 曜日ごとに出さない枠（0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土）
  EXCLUDED_SLOTS_BY_WEEKDAY: {
    2: ['10:30'], // 火曜日は10:30枠なし
  },

  // 終日受付しない日：第n◯曜日（例：第1・第3月曜日）
  CLOSED_NTH_WEEKDAYS: [
    { weekday: 1, nth: [1, 3] },
  ],

  // 個別に休みにしたい日（'2026-12-31' の形式）
  CLOSED_DATES: [],

  // 何時間前まで予約を受け付けるか / 何日先まで表示するか
  MIN_HOURS_BEFORE: 24,
  MAX_DAYS_AHEAD: 30,

  // 予定の前後に空けておきたい時間（分）。移動がある場合などに使用
  BUFFER_MINUTES: 0,

  // 終日の予定（「休み」など）がある日も予約不可にするか
  ALL_DAY_EVENTS_BLOCK: true,

  // 終日予定でもタイトルにこれらを含むものは無視する（誕生日・祝日など）
  IGNORE_ALL_DAY_KEYWORDS: ['誕生日', '祝日'],

  // 表示・メール用
  TITLE: '個別相談のご予約',
  OWNER_NAME: '担当FP',
  OWNER_NOTIFY_EMAIL: '', // 空なら、このスクリプトのオーナー（自分）に通知
  EVENT_TITLE_PREFIX: '【個別相談】',
  METHODS: ['対面', 'オンライン（Zoom等）', '電話'],
  TOPICS: ['ライフプラン全般', '保険の見直し', '介護・認知症への備え', '老後資金・資産形成', '教育資金', 'その他'],

  TIME_ZONE: 'Asia/Tokyo',
};

/* ===================== Web画面 ===================== */

function doGet() {
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.config = {
    title: CONFIG.TITLE,
    ownerName: CONFIG.OWNER_NAME,
    slotMinutes: CONFIG.SLOT_MINUTES,
    methods: CONFIG.METHODS,
    topics: CONFIG.TOPICS,
  };
  return tpl.evaluate()
    .setTitle(CONFIG.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ===================== 画面から呼ばれる関数 ===================== */

/** 空き枠一覧を返す。[{ date: '2026-10-20', label: '10/20(火)', slots: [{ start: ISO, label: '13:00〜14:30' }] }] */
function getAvailableSlots() {
  const now = new Date();
  const candidates = buildCandidateSlots_(now, CONFIG);
  if (candidates.length === 0) return [];

  const rangeStart = candidates[0].start;
  const rangeEnd = candidates[candidates.length - 1].end;
  const busy = getBusyIntervals_(rangeStart, rangeEnd);
  const free = filterFreeSlots_(candidates, busy, CONFIG.BUFFER_MINUTES);
  return groupByDate_(free);
}

/** 予約を確定する。成功時は確認内容を返す。 */
function bookSlot(form) {
  const data = validateForm_(form);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('ただいま混み合っています。少し時間をおいて再度お試しください。');
  }
  try {
    const start = new Date(data.start);
    const now = new Date();
    // 改ざん防止：送られてきた時刻が正規の候補枠かを再確認
    const slot = buildCandidateSlots_(now, CONFIG).find(s => s.start.getTime() === start.getTime());
    if (!slot) {
      throw new Error('この枠は受付対象外です。画面を更新して別の枠をお選びください。');
    }
    // ロック中に最新のカレンダーで空きを再確認（ダブルブッキング防止）
    const busy = getBusyIntervals_(slot.start, slot.end);
    if (filterFreeSlots_([slot], busy, CONFIG.BUFFER_MINUTES).length === 0) {
      throw new Error('申し訳ありません。この枠は直前に埋まりました。別の枠をお選びください。');
    }

    const cal = getCalendar_(CONFIG.BOOKING_CALENDAR_ID);
    const title = `${CONFIG.EVENT_TITLE_PREFIX}${data.name}様（${data.method}）`;
    const event = cal.createEvent(title, slot.start, slot.end, {
      description: buildEventDescription_(data),
    });
    event.setTag('booking', 'web');

    const when = formatSlotLabel_(slot);
    sendMails_(data, when);
    return { when: when, name: data.name, method: data.method };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== 枠の組み立て（純粋関数） ===================== */

/** 受付ルールに従って候補枠を作る（カレンダーは見ない） */
function buildCandidateSlots_(now, cfg) {
  const slots = [];
  const earliest = now.getTime() + cfg.MIN_HOURS_BEFORE * 3600 * 1000;
  const todayYmd = ymdInTz_(now, cfg.TIME_ZONE);

  for (let i = 0; i <= cfg.MAX_DAYS_AHEAD; i++) {
    const ymd = addDaysYmd_(todayYmd, i);
    if (isClosedDay_(ymd, cfg)) continue;
    const weekday = weekdayOf_(ymd);
    const excluded = cfg.EXCLUDED_SLOTS_BY_WEEKDAY[weekday] || [];

    cfg.SLOT_START_TIMES.forEach(hm => {
      if (excluded.indexOf(hm) !== -1) return;
      const start = jstDate_(ymd, hm);
      if (start.getTime() < earliest) return;
      const end = new Date(start.getTime() + cfg.SLOT_MINUTES * 60 * 1000);
      slots.push({ ymd: ymd, hm: hm, start: start, end: end });
    });
  }
  return slots;
}

function isClosedDay_(ymd, cfg) {
  if (cfg.CLOSED_DATES.indexOf(ymd) !== -1) return true;
  const weekday = weekdayOf_(ymd);
  const nth = Math.floor((Number(ymd.slice(8, 10)) - 1) / 7) + 1; // その月の第何◯曜日か
  return cfg.CLOSED_NTH_WEEKDAYS.some(rule => rule.weekday === weekday && rule.nth.indexOf(nth) !== -1);
}

/** busy区間（前後バッファ込み）と1分でも重なる枠を除外 */
function filterFreeSlots_(slots, busy, bufferMinutes) {
  const buf = (bufferMinutes || 0) * 60 * 1000;
  return slots.filter(s => !busy.some(b =>
    b.start.getTime() < s.end.getTime() + buf && b.end.getTime() > s.start.getTime() - buf
  ));
}

function groupByDate_(slots) {
  const days = [];
  slots.forEach(s => {
    let day = days[days.length - 1];
    if (!day || day.date !== s.ymd) {
      day = { date: s.ymd, label: formatDayLabel_(s.ymd), slots: [] };
      days.push(day);
    }
    day.slots.push({ start: s.start.toISOString(), label: `${s.hm}〜${hmOf_(s.end)}` });
  });
  return days;
}

/* ===================== カレンダー ===================== */

function getCalendar_(id) {
  const cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
  if (!cal) throw new Error(`カレンダーが見つかりません: ${id}`);
  return cal;
}

/** 確認対象カレンダーの予定を busy 区間として取得 */
function getBusyIntervals_(start, end) {
  const buf = CONFIG.BUFFER_MINUTES * 60 * 1000;
  const from = new Date(start.getTime() - buf - 24 * 3600 * 1000);
  const to = new Date(end.getTime() + buf + 24 * 3600 * 1000);
  const busy = [];

  CONFIG.CHECK_CALENDAR_IDS.forEach(id => {
    getCalendar_(id).getEvents(from, to).forEach(ev => {
      // 自分が「不参加」にした招待は空き扱い
      try {
        if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return;
      } catch (e) { /* 共有カレンダー等で取得できない場合は予定ありとして扱う */ }

      if (ev.isAllDayEvent()) {
        if (!CONFIG.ALL_DAY_EVENTS_BLOCK) return;
        const title = ev.getTitle() || '';
        if (CONFIG.IGNORE_ALL_DAY_KEYWORDS.some(k => title.indexOf(k) !== -1)) return;
      }
      busy.push({ start: ev.getStartTime(), end: ev.getEndTime() });
    });
  });
  return busy;
}

function buildEventDescription_(d) {
  return [
    `お名前：${d.name}${d.kana ? `（${d.kana}）` : ''}`,
    `メール：${d.email}`,
    `電話：${d.phone}`,
    `相談方法：${d.method}`,
    `ご相談内容：${d.topics.join('、') || '未選択'}`,
    '',
    '【ご質問・ご要望】',
    d.note || 'なし',
    '',
    '— Web予約フォームより自動登録',
  ].join('\n');
}

/* ===================== メール ===================== */

function sendMails_(d, when) {
  const ownerEmail = CONFIG.OWNER_NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();

  MailApp.sendEmail({
    to: d.email,
    replyTo: ownerEmail,
    name: CONFIG.OWNER_NAME,
    subject: `【ご予約確定】個別相談 ${when}`,
    body: [
      `${d.name} 様`,
      '',
      'このたびは個別相談のご予約をいただき、ありがとうございます。',
      '以下の内容で承りました。',
      '',
      `日時：${when}`,
      `相談方法：${d.method}`,
      `ご相談内容：${d.topics.join('、') || '未選択'}`,
      '',
      d.method.indexOf('オンライン') !== -1
        ? '接続用URLは前日までに改めてご連絡いたします。'
        : '詳細は前日までに改めてご連絡いたします。',
      '日程の変更・キャンセルは、このメールにご返信ください。',
      '',
      '当日お会いできることを楽しみにしております。',
      '',
      CONFIG.OWNER_NAME,
    ].join('\n'),
  });

  MailApp.sendEmail({
    to: ownerEmail,
    subject: `【新規予約】${when} ${d.name}様（${d.method}）`,
    body: `Web予約フォームから新しい予約が入りました。\n\n日時：${when}\n${buildEventDescription_(d)}`,
  });
}

/* ===================== 入力チェック ===================== */

function validateForm_(f) {
  const s = v => String(v == null ? '' : v).trim();
  const d = {
    start: s(f && f.start),
    name: s(f && f.name).slice(0, 50),
    kana: s(f && f.kana).slice(0, 50),
    email: s(f && f.email).slice(0, 100),
    phone: s(f && f.phone).slice(0, 20),
    method: s(f && f.method),
    topics: (Array.isArray(f && f.topics) ? f.topics : []).map(s).filter(t => CONFIG.TOPICS.indexOf(t) !== -1),
    note: s(f && f.note).slice(0, 1000),
  };
  if (!d.start || isNaN(new Date(d.start).getTime())) throw new Error('日時を選択してください。');
  if (!d.name) throw new Error('お名前を入力してください。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new Error('メールアドレスの形式をご確認ください。');
  if (!/^[0-9０-９\-－+() ]{10,20}$/.test(d.phone)) throw new Error('電話番号をご確認ください。');
  if (CONFIG.METHODS.indexOf(d.method) === -1) throw new Error('相談方法を選択してください。');
  return d;
}

/* ===================== 日付ユーティリティ（JST固定） ===================== */

function ymdInTz_(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

function addDaysYmd_(ymd, n) {
  const p = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

function weekdayOf_(ymd) {
  const p = ymd.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}

function jstDate_(ymd, hm) {
  return new Date(`${ymd}T${hm}:00+09:00`);
}

function hmOf_(date) {
  return Utilities.formatDate(date, CONFIG.TIME_ZONE, 'HH:mm');
}

function formatDayLabel_(ymd) {
  const w = '日月火水木金土'[weekdayOf_(ymd)];
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}(${w})`;
}

function formatSlotLabel_(slot) {
  return `${slot.ymd.slice(0, 4)}年${formatDayLabel_(slot.ymd).replace('/', '月').replace('(', '日(')} ${slot.hm}〜${hmOf_(slot.end)}`;
}

/* ===================== 動作確認用（エディタから実行） ===================== */

/** 初回に一度実行して権限を許可し、ログで空き枠を確認する */
function testListSlots() {
  getAvailableSlots().forEach(d => Logger.log(`${d.label}: ${d.slots.map(s => s.label).join(' / ')}`));
}
