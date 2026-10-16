/**
 * 個別相談 予約システム（Google Apps Script）
 *
 * - 公開URLを開くと、空いている枠だけが表示される
 * - Googleカレンダーに予定がある時間帯は自動的に予約不可
 * - 予約が入るとZoom会議を自動発行し、カレンダーに予定を作成、お客様と自分に確認メールを送る
 *
 * 設定はこの CONFIG だけを書き換えればOK。
 */
const CONFIG = {
  // 予約を書き込むカレンダー（'primary' = 自分のメインカレンダー）
  BOOKING_CALENDAR_ID: 'primary',

  // 空き判定に使うカレンダー（仕事用・家族用など、予定を見たいものを全部並べる）
  CHECK_CALENDAR_IDS: ['primary'],

  // 枠の開始時刻（毎日）と1枠の長さ（分）
  // 曜日ごとの枠の開始時刻（0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土）。空配列 [] でその曜日は受付なし
  SLOT_START_TIMES_BY_WEEKDAY: {
    0: ['9:00', '10:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30'], // 日
    1: ['10:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30'],         // 月
    2: ['10:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30'],         // 火
    3: ['10:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30'],         // 水
    4: ['10:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30'],         // 木
    5: ['9:00', '10:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30'], // 金
    6: ['9:00', '10:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30'], // 土
  },
  // お客様に見せる相談時間（分）。カレンダー・Zoomもこの長さで作成
  SLOT_MINUTES: 60,
  // 相談後に確保する準備・休憩時間（分）。この時間に予定がある枠も予約不可にする
  PREP_MINUTES_AFTER: 30,

  // 終日受付しない日：第n◯曜日（例：第1・第3月曜日）
  CLOSED_NTH_WEEKDAYS: [
    { weekday: 1, nth: [1, 3] },
  ],

  // 個別に休みにしたい日（'2026-12-31' の形式）
  CLOSED_DATES: [],

  // 何時間前まで予約を受け付けるか / 何日先まで表示するか
  MIN_HOURS_BEFORE: 24,
  MAX_DAYS_AHEAD: 30,

  // カレンダーの表示：空き枠がこの数以下なら △（残りわずか）、それより多ければ ◯、0なら ×
  FEW_SLOTS_THRESHOLD: 2,

  // 予定の前後に空けておきたい時間（分）。移動がある場合などに使用
  BUFFER_MINUTES: 0,

  // 終日予定は基本的にメモ扱い（予約を止めない）。タイトルにこれらを含む終日予定がある日だけ、丸ごと予約不可にする
  ALL_DAY_BLOCK_KEYWORDS: ['休み', '休業', '予約不可'],

  // 表示・メール用
  TITLE: 'オンライン個別相談のご予約',
  OWNER_NAME: '担当FP',
  OWNER_NOTIFY_EMAIL: '', // 空なら、このスクリプトのオーナー（自分）に通知
  EVENT_TITLE_PREFIX: '【個別相談】',
  // Web予約はオンラインのみ。対面の予定は自分でカレンダーに直接入れる運用
  // （複数並べると、お客様が予約画面で選べるようになる）
  METHODS: ['オンライン'],
  TOPICS: ['ライフプラン全般', '保険の見直し', '介護・認知症への備え', '老後資金・資産形成', '教育資金', 'その他'],

  TIME_ZONE: 'Asia/Tokyo',

  // Zoom会議URLを予約時に自動発行するか
  // 認証情報はコードに書かず「プロジェクトの設定 → スクリプト プロパティ」に登録する
  //   ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET（必須）
  //   ZOOM_USER_ID（任意。未設定なら 'me'。うまくいかない時は自分のZoomのメールアドレス）
  ZOOM_ENABLED: true,

  // リマインドメール：相談開始の何時間前に送るか（setupReminder を一度実行すると有効になる）
  REMIND_HOURS_BEFORE: 24,
  // 予約からこの時間以内に始まる相談は、確認メールを送ったばかりなのでリマインドを省略
  REMIND_SKIP_IF_BOOKED_WITHIN_HOURS: 12,
};

/* ===================== Web画面 ===================== */

function doGet() {
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.config = {
    title: CONFIG.TITLE,
    ownerName: CONFIG.OWNER_NAME,
    slotMinutes: CONFIG.SLOT_MINUTES,
    maxDaysAhead: CONFIG.MAX_DAYS_AHEAD,
    fewSlots: CONFIG.FEW_SLOTS_THRESHOLD,
    timeZone: CONFIG.TIME_ZONE,
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
    const busy = getBusyIntervals_(slot.start, slot.blockEnd);
    if (filterFreeSlots_([slot], busy, CONFIG.BUFFER_MINUTES).length === 0) {
      throw new Error('申し訳ありません。この枠は直前に埋まりました。別の枠をお選びください。');
    }

    const title = `${CONFIG.EVENT_TITLE_PREFIX}${data.name}様（${data.method}）`;
    const when = formatSlotLabel_(slot);

    // Zoomの発行に失敗しても予約自体は受け付け、URLは後から手動で送る
    let zoom = null;
    let zoomError = '';
    if (CONFIG.ZOOM_ENABLED && data.method.indexOf('オンライン') !== -1) {
      try {
        zoom = createZoomMeeting_(title, slot.start, CONFIG.SLOT_MINUTES);
      } catch (e) {
        zoomError = String(e && e.message || e);
        console.error('Zoom発行エラー: ' + zoomError);
      }
    }

    try {
      const event = getCalendar_(CONFIG.BOOKING_CALENDAR_ID).createEvent(title, slot.start, slot.end, {
        description: (zoom ? buildZoomText_(zoom) + '\n\n' : '') + buildEventDescription_(data),
        location: zoom ? zoom.joinUrl : '',
      });
      event.setTag('booking', 'web');
      // リマインドメール用にお客様情報とZoom情報を予定に保存
      event.setTag('customerName', data.name);
      event.setTag('customerEmail', data.email);
      event.setTag('method', data.method);
      if (zoom) {
        event.setTag('zoomMeetingId', String(zoom.id));
        event.setTag('zoomJoinUrl', zoom.joinUrl);
        event.setTag('zoomPassword', zoom.password);
      }
    } catch (e) {
      if (zoom) deleteZoomMeeting_(zoom.id); // 予定を作れなかったら発行したZoomも取り消す
      throw e;
    }

    sendMails_(data, when, zoom, zoomError);
    return { when: when, name: data.name, method: data.method, zoomUrl: zoom ? zoom.joinUrl : '' };
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
    (cfg.SLOT_START_TIMES_BY_WEEKDAY[weekday] || []).forEach(raw => {
      const hm = raw.padStart(5, '0'); // '9:00' → '09:00'
      const start = jstDate_(ymd, hm);
      if (start.getTime() < earliest) return;
      const end = new Date(start.getTime() + cfg.SLOT_MINUTES * 60 * 1000);
      const blockEnd = new Date(end.getTime() + (cfg.PREP_MINUTES_AFTER || 0) * 60 * 1000);
      slots.push({ ymd: ymd, hm: hm, start: start, end: end, blockEnd: blockEnd });
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

/** busy区間（前後バッファ込み）と、相談時間＋準備時間が1分でも重なる枠を除外 */
function filterFreeSlots_(slots, busy, bufferMinutes) {
  const buf = (bufferMinutes || 0) * 60 * 1000;
  return slots.filter(s => !busy.some(b =>
    b.start.getTime() < (s.blockEnd || s.end).getTime() + buf && b.end.getTime() > s.start.getTime() - buf
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
        const title = ev.getTitle() || '';
        if (!CONFIG.ALL_DAY_BLOCK_KEYWORDS.some(k => title.indexOf(k) !== -1)) return;
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

function sendMails_(d, when, zoom, zoomError) {
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
      zoom
        ? `当日は以下のZoomからご参加ください。\n\n${buildZoomText_(zoom)}\n\n開始5分前からご入室いただけます。Zoomアプリを事前に入れておくとスムーズです。`
        : d.method.indexOf('オンライン') !== -1
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
    body: [
      'Web予約フォームから新しい予約が入りました。',
      ...(zoomError ? ['', '※Zoomの自動発行に失敗しました。お客様にURLを手動でお送りください。', `（${zoomError}）`] : []),
      '',
      `日時：${when}`,
      ...(zoom ? [`Zoom：${zoom.joinUrl}`] : []),
      buildEventDescription_(d),
    ].join('\n'),
  });
}

/* ===================== リマインドメール ===================== */

/**
 * 1時間ごとに自動実行。REMIND_HOURS_BEFORE 時間以内に始まるWeb予約で、
 * まだリマインドを送っていないものにメールを送る。
 * 日時をカレンダー上で動かした場合も、動かした後の日時で送られる。予定を消せば送られない。
 */
function sendReminders() {
  const now = new Date();
  const until = new Date(now.getTime() + CONFIG.REMIND_HOURS_BEFORE * 3600 * 1000);
  const skipWithin = CONFIG.REMIND_SKIP_IF_BOOKED_WITHIN_HOURS * 3600 * 1000;
  const ownerEmail = CONFIG.OWNER_NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();

  getCalendar_(CONFIG.BOOKING_CALENDAR_ID).getEvents(now, until).forEach(ev => {
    if (ev.getTag('booking') !== 'web' || ev.getTag('reminded')) return;
    if (ev.getStartTime().getTime() < now.getTime()) return; // すでに始まっている
    const email = ev.getTag('customerEmail');
    if (!email) return;

    // 直前の予約は確認メールで十分なので送らない
    if (ev.getStartTime().getTime() - ev.getDateCreated().getTime() < skipWithin) {
      ev.setTag('reminded', 'skipped');
      return;
    }

    const when = formatRangeLabel_(ev.getStartTime(), ev.getEndTime());
    const zoom = ev.getTag('zoomJoinUrl')
      ? { id: ev.getTag('zoomMeetingId'), joinUrl: ev.getTag('zoomJoinUrl'), password: ev.getTag('zoomPassword') }
      : null;

    try {
      MailApp.sendEmail({
        to: email,
        replyTo: ownerEmail,
        name: CONFIG.OWNER_NAME,
        subject: `【リマインド】個別相談 ${when}`,
        body: [
          `${ev.getTag('customerName') || ''} 様`,
          '',
          'ご予約いただいている個別相談のご案内です。',
          'お会いできることを楽しみにしております。',
          '',
          `日時：${when}`,
          `相談方法：${ev.getTag('method') || 'オンライン'}`,
          '',
          zoom
            ? `当日は以下のZoomからご参加ください。\n\n${buildZoomText_(zoom)}\n\n開始5分前からご入室いただけます。\nZoomアプリを入れていない場合は、事前にインストールしておくとスムーズです。`
            : '接続方法は別途ご連絡しているご案内をご確認ください。',
          '',
          '【当日あるとスムーズなもの】',
          '・現在ご加入中の保険証券（お手元にあれば）',
          '・メモをとれるもの',
          '',
          'ご都合が悪くなった場合は、このメールにご返信ください。',
          '',
          CONFIG.OWNER_NAME,
        ].join('\n'),
      });
      ev.setTag('reminded', new Date().toISOString());
    } catch (e) {
      console.error(`リマインド送信失敗（${when}）: ${e}`);
    }
  });
}

/** 最初に一度だけ実行：sendReminders を1時間ごとに自動実行する設定を作る（何度実行しても1つだけ） */
function setupReminder() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendReminders')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();
  Logger.log('リマインドメールの自動送信を設定しました（1時間ごとにチェック）');
}

/** リマインドを止めたいとき */
function stopReminder() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendReminders')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('リマインドメールの自動送信を停止しました');
}

/* ===================== Zoom ===================== */

/** Server-to-Server OAuth のアクセストークン（約1時間有効なので50分キャッシュ） */
function getZoomToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('zoomToken');
  if (cached) return cached;

  const p = PropertiesService.getScriptProperties();
  const accountId = p.getProperty('ZOOM_ACCOUNT_ID');
  const clientId = p.getProperty('ZOOM_CLIENT_ID');
  const secret = p.getProperty('ZOOM_CLIENT_SECRET');
  if (!accountId || !clientId || !secret) {
    throw new Error('スクリプト プロパティに ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET が未登録です');
  }
  const res = UrlFetchApp.fetch(
    'https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' + encodeURIComponent(accountId), {
      method: 'post',
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(clientId + ':' + secret) },
      muteHttpExceptions: true,
    });
  if (res.getResponseCode() !== 200) {
    throw new Error(`Zoom認証エラー(${res.getResponseCode()}): ${res.getContentText().slice(0, 200)}`);
  }
  const token = JSON.parse(res.getContentText()).access_token;
  cache.put('zoomToken', token, 50 * 60);
  return token;
}

function zoomUserId_() {
  return PropertiesService.getScriptProperties().getProperty('ZOOM_USER_ID') || 'me';
}

function createZoomMeeting_(topic, start, minutes) {
  const res = UrlFetchApp.fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(zoomUserId_())}/meetings`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getZoomToken_() },
    payload: JSON.stringify({
      topic: topic,
      type: 2, // 日時指定のミーティング
      start_time: Utilities.formatDate(start, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      duration: minutes,
      timezone: CONFIG.TIME_ZONE,
      settings: {
        waiting_room: true,     // 自分が許可してから入室
        join_before_host: false,
        mute_upon_entry: false,
        host_video: true,
        participant_video: true,
      },
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 201) {
    throw new Error(`Zoom会議の作成に失敗(${res.getResponseCode()}): ${res.getContentText().slice(0, 200)}`);
  }
  const m = JSON.parse(res.getContentText());
  return { id: m.id, joinUrl: m.join_url, password: m.password || '' };
}

function deleteZoomMeeting_(id) {
  try {
    UrlFetchApp.fetch(`https://api.zoom.us/v2/meetings/${id}`, {
      method: 'delete',
      headers: { Authorization: 'Bearer ' + getZoomToken_() },
      muteHttpExceptions: true,
    });
  } catch (e) {
    console.error('Zoom会議の削除に失敗: ' + e);
  }
}

function buildZoomText_(z) {
  const id = String(z.id).replace(/^(\d{3})(\d{4})(\d+)$/, '$1 $2 $3');
  return [
    `Zoom参加URL：${z.joinUrl}`,
    `ミーティングID：${id}`,
    z.password ? `パスコード：${z.password}` : '',
  ].filter(Boolean).join('\n');
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

function formatRangeLabel_(start, end) {
  return formatSlotLabel_({ ymd: ymdInTz_(start, CONFIG.TIME_ZONE), hm: hmOf_(start), end: end });
}

function formatSlotLabel_(slot) {
  return `${slot.ymd.slice(0, 4)}年${formatDayLabel_(slot.ymd).replace('/', '月').replace('(', '日(')} ${slot.hm}〜${hmOf_(slot.end)}`;
}

/* ===================== 動作確認用（エディタから実行） ===================== */

/** 初回に一度実行して権限を許可し、ログで空き枠を確認する */
function testListSlots() {
  getAvailableSlots().forEach(d => Logger.log(`${d.label}: ${d.slots.map(s => s.label).join(' / ')}`));
}

/** Zoom連携の確認：テスト会議を作成してURLをログに出し、すぐ削除する */
function testZoom() {
  const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const z = createZoomMeeting_('【テスト】予約システム接続確認', start, CONFIG.SLOT_MINUTES);
  Logger.log('Zoom連携OK\n' + buildZoomText_(z));
  deleteZoomMeeting_(z.id);
  Logger.log('テスト会議は削除しました');
}
