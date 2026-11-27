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
  // 'primary'（メイン）、カレンダーの名前（Googleカレンダーの左の一覧に出ている名前そのまま）、
  // またはカレンダーID（…@group.calendar.google.com）のどれでも書ける。
  // このコードは公開リポジトリにあるので、IDではなく名前で書く
  // 「家族（仕事ダメ）」＝妻と共有。ここに入れた予定は、妻が入れたものでも枠を止める
  // 「家族（仕事OK）」（Googleファミリーのカレンダー）はあえて入れない（入れた予定は枠を止めない）
  CHECK_CALENDAR_IDS: ['primary', '家族（仕事ダメ）'],

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

  // 予約の種類。予約ページのURLの最後に ?type=partner を付けると協業先用の画面になる（付けなければ consult）
  // 枠の時間・長さ・締め切り・Zoomなどは共通。ここに書いた項目だけ種類ごとに変わる
  BOOKING_TYPES: {
    consult: {
      LABEL: '個別相談',                       // メールの件名・通知に使う呼び名
      TITLE: 'オンライン個別相談のご予約',       // 予約ページの見出し
      LEAD: 'ご相談はオンライン（ビデオ通話）で行います。ご自宅から、スマホでもご参加いただけます。\nご都合のよい日時をお選びください。',
      EVENT_TITLE_PREFIX: '【個別相談】',      // カレンダーの予定名の頭
      FORM_HEADING: 'お客様情報',
      ASK_COMPANY: false,                      // 会社名の入力欄を出すか（出すときは必須）
      TOPICS_LABEL: 'ご相談になりたいこと（複数可）',
      TOPICS: ['ライフプラン全般', '保険の見直し', '介護・認知症への備え', '老後資金・資産形成', '教育資金', 'その他'],
      NOTE_LABEL: 'ご質問・ご要望など',
      NOTE_PLACEHOLDER: '例）親の介護が始まりそうで、お金の準備について相談したい',
      SHOW_CHARA: true,                        // ほっくまを出すか
      MAIL: 'consult',                         // メール文面の種類（consult / partner）
      // 対面の希望も例外として受け付けるか。受け付けると、フォームに「対面を希望する」のチェックが出る。
      // 対面のときはZoomを作らず、こちらからお客様に電話して場所・時間を決める（選ばれた日時は仮押さえ）
      IN_PERSON: true,
    },
    partner: {
      LABEL: '協業面談',
      TITLE: 'お打ち合わせのご予約',
      LEAD: 'オンライン（Zoom）でのお打ち合わせです。\nご都合のよい日時をお選びください。',
      EVENT_TITLE_PREFIX: '【協業面談】',
      FORM_HEADING: 'ご予約者の情報',
      ASK_COMPANY: true,
      TOPICS_LABEL: '',
      TOPICS: [],                              // 空なら選択欄を出さない
      NOTE_LABEL: '面談の目的・ご用件',
      NOTE_PLACEHOLDER: '例）協業のご相談、サービスのご紹介 など',
      SHOW_CHARA: true,
      MAIL: 'partner',
      IN_PERSON: false,
    },
  },

  // 表示・メール用
  OWNER_NAME: 'Gift Your Life株式会社 小野 健汰', // メールの差出人名
  // メールの最後に入れる署名（1行ずつ）
  SIGNATURE: [
    'Gift Your Life株式会社',
    'ファイナンシャルプランナー　小野 健汰',
  ],
  // お客様へのメールの書き出し（「◯◯様」の次の行）
  MAIL_INTRO: 'Gift Your Life株式会社の小野です。',
  // 確認メール・リマインドメールの「あるとスムーズなもの」（1行ずつ。メモは最後に自動で入る）
  BRING_ITEMS: [
    'ご加入中の保険証券',
    'ねんきん定期便',
    '収入がわかるもの（源泉徴収票など）',
    '住宅ローンの返済予定表（ローンがある方）',
  ],
  OWNER_NOTIFY_EMAIL: '', // 空なら、このスクリプトのオーナー（自分）に通知
  // Web予約はオンラインが基本。対面は BOOKING_TYPES の IN_PERSON: true の種類だけ、例外として受け付ける
  // （METHODS を複数並べると、お客様が予約画面で選べるようになる）
  METHODS: ['オンライン'],
  IN_PERSON_METHOD: '対面',
  // 対面の希望が入ったとき、お客様へのメールに「この番号からお電話します」と書く番号。
  // このコードは公開リポジトリにあるので、番号はここではなく、スクリプト プロパティ OWNER_PHONE に登録する（未登録なら書かない）

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

  // お客様が自分でキャンセルできるリンクを、確認メールとリマインドメールに付けるか
  CANCEL_ENABLED: true,
  // 開始の何時間前までリンクでキャンセルできるか（0 = 開始時刻まで）。過ぎたら「メールでご連絡を」と表示
  CANCEL_MIN_HOURS_BEFORE: 0,
  // 予約ページのURL（…/exec）。空なら自動で取得する。リンクがうまく開かないときだけ、デプロイ後のURLを貼る
  WEB_APP_URL: '',
};

/* ===================== Web画面 ===================== */

function doGet(e) {
  // キャンセル用リンク（?cancel=…）から開かれたとき。開いただけでは取り消さず、確認ボタンを押してもらう
  const cancelToken = e && e.parameter && e.parameter.cancel;
  if (cancelToken) {
    const page = HtmlService.createTemplateFromFile('Cancel');
    page.title = 'ご予約のキャンセル';
    page.token = String(cancelToken);
    page.info = getCancelInfo_(String(cancelToken));
    return page.evaluate()
      .setTitle('ご予約のキャンセル')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const type = typeKey_(e && e.parameter && e.parameter.type);
  const t = typeConf_(type);
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.config = {
    type: type,
    title: t.TITLE,
    lead: t.LEAD,
    formHeading: t.FORM_HEADING,
    askCompany: !!t.ASK_COMPANY,
    topicsLabel: t.TOPICS_LABEL,
    noteLabel: t.NOTE_LABEL,
    notePlaceholder: t.NOTE_PLACEHOLDER,
    showChara: t.SHOW_CHARA !== false,
    ownerName: CONFIG.OWNER_NAME,
    slotMinutes: CONFIG.SLOT_MINUTES,
    maxDaysAhead: CONFIG.MAX_DAYS_AHEAD,
    fewSlots: CONFIG.FEW_SLOTS_THRESHOLD,
    timeZone: CONFIG.TIME_ZONE,
    methods: CONFIG.METHODS,
    inPerson: !!t.IN_PERSON,
    inPersonMethod: CONFIG.IN_PERSON_METHOD,
    topics: t.TOPICS || [],
  };
  return tpl.evaluate()
    .setTitle(t.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** URLの ?type= を予約の種類に。知らない値や空なら consult */
function typeKey_(raw) {
  const k = String(raw || '').trim();
  return Object.prototype.hasOwnProperty.call(CONFIG.BOOKING_TYPES, k) ? k : 'consult';
}

function typeConf_(type) {
  return CONFIG.BOOKING_TYPES[typeKey_(type)];
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

    const t = typeConf_(data.type);
    // 対面は場所が決まっていないので、カレンダーでも「要電話」とわかるようにする（電話して決めたら題名を直してよい）
    const title = `${t.EVENT_TITLE_PREFIX}${data.company ? data.company + ' ' : ''}${data.name}様（${data.method}${isInPerson_(data.method) ? '・要電話' : ''}）`;
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

    const cancelToken = CONFIG.CANCEL_ENABLED ? Utilities.getUuid().replace(/-/g, '') : '';
    try {
      const event = getCalendar_(CONFIG.BOOKING_CALENDAR_ID).createEvent(title, slot.start, slot.end, {
        description: (zoom ? buildZoomText_(zoom) + '\n\n' : '') + buildEventDescription_(data),
        location: zoom ? zoom.joinUrl : '',
      });
      event.setTag('booking', 'web');
      event.setTag('bookingType', data.type);
      // リマインドメール用にお客様情報とZoom情報を予定に保存
      event.setTag('customerName', data.name);
      if (data.company) event.setTag('company', data.company);
      event.setTag('customerEmail', data.email);
      event.setTag('method', data.method);
      if (zoom) {
        event.setTag('zoomMeetingId', String(zoom.id));
        event.setTag('zoomJoinUrl', zoom.joinUrl);
        event.setTag('zoomPassword', zoom.password);
      }
      if (cancelToken) {
        // キャンセル用リンクの合言葉 → 予定を探せるように保存
        event.setTag('cancelToken', cancelToken);
        PropertiesService.getScriptProperties().setProperty(CANCEL_PROP_PREFIX + cancelToken, event.getId());
      }
    } catch (e) {
      if (zoom) deleteZoomMeeting_(zoom.id); // 予定を作れなかったら発行したZoomも取り消す
      throw e;
    }

    sendMails_(data, when, zoom, zoomError, cancelToken ? cancelUrl_(cancelToken) : '');
    return { when: when, name: data.name, method: data.method, inPerson: isInPerson_(data.method), zoomUrl: zoom ? zoom.joinUrl : '' };
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

/** 'primary' / カレンダーID（@を含む）/ カレンダーの名前 のどれかからカレンダーを返す */
function getCalendar_(id) {
  if (id === 'primary') return CalendarApp.getDefaultCalendar();
  if (String(id).indexOf('@') !== -1) {
    const cal = CalendarApp.getCalendarById(id);
    if (!cal) throw new Error(`カレンダーが見つかりません: ${id}`);
    return cal;
  }
  const found = CalendarApp.getCalendarsByName(id);
  if (found.length === 0) throw new Error(`「${id}」という名前のカレンダーが見つかりません。名前を変えた場合は CONFIG も直してください`);
  if (found.length > 1) throw new Error(`「${id}」という名前のカレンダーが ${found.length} 個あります。どちらかの名前を変えてください`);
  return found[0];
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
  const t = typeConf_(d.type);
  return [
    `種類：${t.LABEL}`,
    ...(d.company ? [`会社名：${d.company}`] : []),
    `お名前：${d.name}${d.kana ? `（${d.kana}）` : ''}`,
    `メール：${d.email}`,
    `電話：${d.phone}`,
    `方法：${d.method}`,
    ...(isInPerson_(d.method) ? [
      '※対面のご希望です。こちらからお電話して、場所と時間を決めてください（この日時は仮押さえ）',
      `お電話のつながりやすい時間帯：${d.callTime || '指定なし'}`,
    ] : []),
    ...((t.TOPICS || []).length ? [`ご相談内容：${d.topics.join('、') || '未選択'}`] : []),
    '',
    `【${t.NOTE_LABEL}】`,
    d.note || 'なし',
    '',
    '— Web予約フォームより自動登録',
  ].join('\n');
}

/* ===================== メール ===================== */

function signature_() {
  return (CONFIG.SIGNATURE && CONFIG.SIGNATURE.length ? CONFIG.SIGNATURE : [CONFIG.OWNER_NAME]).join('\n');
}

/** キャンセルの案内文（リンクが作れないときは返信での案内） */
function cancelGuide_(url) {
  return url
    ? `ご都合が悪くなったときは、下のリンクからキャンセルできます。\n${url}\n日程を変えたいときは、このメールにそのままご返信ください。`
    : 'キャンセルや日程の変更は、このメールにそのままご返信ください。';
}

/** 対面の希望か（対面は例外扱いで、こちらから電話して場所・時間を決める） */
function isInPerson_(method) {
  return String(method || '') === CONFIG.IN_PERSON_METHOD;
}

/** お客様に「この番号からお電話します」と伝える番号（スクリプト プロパティ OWNER_PHONE。未登録なら空） */
function ownerPhone_() {
  try {
    return PropertiesService.getScriptProperties().getProperty('OWNER_PHONE') || '';
  } catch (e) {
    return '';
  }
}

/** 対面のご希望をいただいたときの、確認メールの「場所とお時間の決め方」 */
function inPersonCallGuide_(d) {
  const from = ownerPhone_();
  return [
    '対面でのご相談をご希望いただき、ありがとうございます。',
    `場所（ご自宅・お近くのカフェなど）とお時間は、小野から ${d.phone} にお電話してご相談させてください。`,
    ...(from ? [`お電話は ${from} からおかけします。`] : []),
    ...(d.callTime ? [`ご指定の「${d.callTime}」をめやすにおかけします。`] : []),
    '',
    '上の日時は、仮のご予約としてお取りしています。',
    'お電話で場所とお時間が決まりましたら、正式なご予約となります。',
  ].join('\n');
}

/** 参加方法のブロック（Zoomあり／オンラインだがURL未発行／対面） */
function joinGuide_(method, zoom, place) {
  if (zoom) {
    return [
      'お時間になりましたら、下のZoomからご参加ください。',
      '',
      buildZoomText_(zoom),
      '',
      '開始5分前から入室できます。Zoomアプリを先に入れておくとスムーズです。',
      'お顔を出さず、音声だけでのご参加でも大丈夫です。',
    ].join('\n');
  }
  if (String(method).indexOf('オンライン') !== -1) {
    return '参加用のURLは、前日までにあらためてお送りします。\nお顔を出さず、音声だけでのご参加でも大丈夫です。';
  }
  if (isInPerson_(method)) {
    // 電話で決めた場所を、カレンダーの予定の「場所」に入れておくと、リマインドに載る
    return place
      ? `場所：${place}\nお電話でお決めした場所で、お待ちしています。`
      : '場所は、お電話でお決めしたところでお会いします。\nまだお電話がつながっていない場合は、このメールにご返信ください。';
  }
  return '場所などの詳しいご案内は、前日までにあらためてお送りします。';
}

/** 「あるとスムーズなもの」のブロック */
function bringGuide_() {
  return [
    ...(CONFIG.BRING_ITEMS || []).map(s => `・${s}`),
    '・メモをとれるもの',
    '',
    '書類がそろわなくても大丈夫です。お手元にあるものだけで、お気軽にご参加ください。',
  ].join('\n');
}

function buildConfirmBody_(d, when, zoom, cancelUrl) {
  const inPerson = isInPerson_(d.method);
  return [
    `${d.name} 様`,
    '',
    CONFIG.MAIL_INTRO,
    'このたびは個別相談にお申し込みいただき、ありがとうございます。',
    inPerson ? '以下の内容で、仮のご予約をお受けしました。' : '以下の内容でご予約をお受けしました。',
    '',
    '■ ご予約内容',
    `日時：${when}${inPerson ? '（仮）' : ''}`,
    `相談方法：${d.method}${zoom ? '（Zoom）' : ''}${inPerson ? '（場所はお電話で決めます）' : ''}`,
    `ご相談内容：${d.topics.join('、') || '当日お聞きします'}`,
    '',
    inPerson ? '■ 場所とお時間の決め方' : '■ 参加方法',
    inPerson ? inPersonCallGuide_(d) : joinGuide_(d.method, zoom),
    '',
    `■ 当日の流れ（${CONFIG.SLOT_MINUTES}分）`,
    'はじめに、今の状況や気になっていることをゆっくりお聞きします。',
    'そのうえで、これからのお金のことを一緒に整理していきます。',
    '商品を無理におすすめすることはありませんので、安心してお話しください。',
    '',
    '■ あるとスムーズなもの',
    bringGuide_(),
    '',
    '■ キャンセル・日程の変更',
    cancelGuide_(cancelUrl),
    '',
    'お話しできるのを楽しみにしています。',
    '',
    signature_(),
  ].join('\n');
}

/** 宛名（会社名があれば上の行に） */
function greeting_(name, company) {
  return [...(company ? [company] : []), `${name || ''} 様`].join('\n');
}

/** 協業先向けの参加方法（カメラオフの一言は付けない） */
function partnerJoinGuide_(method, zoom) {
  if (zoom) {
    return ['下記のZoomからご参加ください。', '', buildZoomText_(zoom), '', '開始5分前から入室できます。'].join('\n');
  }
  return String(method).indexOf('オンライン') !== -1
    ? '接続先のURLは、前日までにあらためてお送りします。'
    : '場所などの詳しいご案内は、前日までにあらためてお送りします。';
}

function buildPartnerConfirmBody_(d, when, zoom, cancelUrl) {
  return [
    greeting_(d.name, d.company),
    '',
    CONFIG.MAIL_INTRO,
    'このたびはお打ち合わせのお時間をいただき、ありがとうございます。',
    '以下の内容で承りました。',
    '',
    '■ 日時',
    `${when}（${CONFIG.SLOT_MINUTES}分）`,
    '',
    '■ ご用件',
    d.note || '当日うかがいます',
    '',
    '■ 参加方法',
    partnerJoinGuide_(d.method, zoom),
    '',
    '■ キャンセル・日程の変更',
    cancelGuide_(cancelUrl),
    '',
    '当日はどうぞよろしくお願いいたします。',
    '',
    signature_(),
  ].join('\n');
}

function buildPartnerReminderBody_(name, company, when, method, zoom, cancelUrl) {
  return [
    greeting_(name, company),
    '',
    CONFIG.MAIL_INTRO,
    'お打ち合わせの日時が近づいてまいりましたので、ご案内をお送りします。',
    '',
    '■ 日時',
    when,
    '',
    '■ 参加方法',
    partnerJoinGuide_(method || 'オンライン', zoom),
    '',
    '■ キャンセル・日程の変更',
    cancelGuide_(cancelUrl),
    '',
    '当日はどうぞよろしくお願いいたします。',
    '',
    signature_(),
  ].join('\n');
}

function buildReminderBody_(name, when, method, zoom, cancelUrl, place) {
  return [
    `${name || ''} 様`,
    '',
    CONFIG.MAIL_INTRO,
    'ご予約いただいている個別相談が近づいてきましたので、ご案内をお送りします。',
    '',
    '■ 日時',
    when,
    '',
    isInPerson_(method) ? '■ 場所' : '■ 参加方法',
    joinGuide_(method || 'オンライン', zoom, place),
    '',
    '■ あるとスムーズなもの',
    bringGuide_(),
    '',
    '■ キャンセル・日程の変更',
    cancelGuide_(cancelUrl),
    '',
    '当日、お話しできるのを楽しみにしています。',
    '',
    signature_(),
  ].join('\n');
}

function sendMails_(d, when, zoom, zoomError, cancelUrl) {
  const ownerEmail = CONFIG.OWNER_NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  const t = typeConf_(d.type);
  const inPerson = isInPerson_(d.method);

  MailApp.sendEmail({
    to: d.email,
    replyTo: ownerEmail,
    name: CONFIG.OWNER_NAME,
    // 対面は場所が決まるまで仮のご予約なので「確定」と書かない
    subject: `${inPerson ? '【ご予約受付】' : '【ご予約確定】'}${t.MAIL === 'partner' ? 'お打ち合わせ' : '個別相談'} ${when}`,
    body: t.MAIL === 'partner' ? buildPartnerConfirmBody_(d, when, zoom, cancelUrl) : buildConfirmBody_(d, when, zoom, cancelUrl),
  });

  MailApp.sendEmail({
    to: ownerEmail,
    subject: `【新規予約・${t.LABEL}${inPerson ? '・対面希望・要電話' : ''}】${when} ${d.company ? d.company + ' ' : ''}${d.name}様（${d.method}）`,
    body: [
      'Web予約フォームから新しい予約が入りました。',
      ...(inPerson ? [
        '',
        '★対面のご希望です。お客様にお電話して、場所と時間を決めてください。',
        `　電話：${d.phone}（つながりやすい時間帯：${d.callTime || '指定なし'}）`,
        '　決まったら、カレンダーの予定の「場所」に入れると、前日のリマインドメールに載ります。',
        '　時間が変わったら、カレンダーの予定をそのまま動かしてください（リマインドも動いた日時で届きます）。',
        '　お客様には「仮のご予約」「小野から電話します」と伝えてあります。',
      ] : []),
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

    const t = typeConf_(ev.getTag('bookingType'));
    const link = ev.getTag('cancelToken') && CONFIG.CANCEL_ENABLED ? cancelUrl_(ev.getTag('cancelToken')) : '';
    try {
      MailApp.sendEmail({
        to: email,
        replyTo: ownerEmail,
        name: CONFIG.OWNER_NAME,
        subject: `【リマインド】${t.MAIL === 'partner' ? 'お打ち合わせ' : '個別相談'} ${when}`,
        body: t.MAIL === 'partner'
          ? buildPartnerReminderBody_(ev.getTag('customerName'), ev.getTag('company'), when, ev.getTag('method'), zoom, link)
          : buildReminderBody_(ev.getTag('customerName'), when, ev.getTag('method'), zoom, link, zoom ? '' : ev.getLocation()),
      });
      ev.setTag('reminded', new Date().toISOString());
    } catch (e) {
      console.error(`リマインド送信失敗（${when}）: ${e}`);
    }
  });

  // 1日1回（深夜3時台）、終わった予約のキャンセル用合言葉を片付ける
  if (hmOf_(now).slice(0, 2) === '03') {
    try { cleanupCancelTokens_(); } catch (e) { console.error('合言葉の片付けに失敗: ' + e); }
  }
}

/* ===================== お客様によるキャンセル ===================== */

const CANCEL_PROP_PREFIX = 'cancel_';

function cancelUrl_(token) {
  let base = CONFIG.WEB_APP_URL;
  if (!base) {
    try { base = ScriptApp.getService().getUrl(); } catch (e) { base = ''; }
  }
  return base ? `${base}?cancel=${token}` : '';
}

/** 合言葉からWeb予約の予定を探す。見つからなければ null */
function findBookingByToken_(token) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const id = PropertiesService.getScriptProperties().getProperty(CANCEL_PROP_PREFIX + token);
  if (!id) return null;
  const ev = getCalendar_(CONFIG.BOOKING_CALENDAR_ID).getEventById(id);
  if (!ev || ev.getTag('cancelToken') !== token) return null;
  return ev;
}

/** キャンセルできる状態かを調べる。status: ok / gone（取消済み・見つからない）/ closed（期限切れ）/ off */
function checkCancelable_(ev) {
  if (!CONFIG.CANCEL_ENABLED) return 'off';
  if (!ev) return 'gone';
  const deadline = ev.getStartTime().getTime() - CONFIG.CANCEL_MIN_HOURS_BEFORE * 3600 * 1000;
  return Date.now() < deadline ? 'ok' : 'closed';
}

/** キャンセル画面の表示内容（画面を開いただけでは何も変えない） */
function getCancelInfo_(token) {
  const ev = findBookingByToken_(token);
  const status = checkCancelable_(ev);
  return {
    status: status,
    when: ev ? formatRangeLabel_(ev.getStartTime(), ev.getEndTime()) : '',
    name: ev ? ev.getTag('customerName') || '' : '',
  };
}

/** 画面の「キャンセルする」ボタンから呼ばれる。予定とZoomを消し、お客様と自分にメールを送る */
function cancelBooking(token) {
  token = String(token || '');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('ただいま混み合っています。少し時間をおいて再度お試しください。');
  }
  try {
    const ev = findBookingByToken_(token);
    const status = checkCancelable_(ev);
    if (status === 'gone') throw new Error('このご予約はすでにキャンセルされているか、見つかりませんでした。');
    if (status === 'closed') throw new Error('キャンセルの受付期限を過ぎています。お手数ですが、予約確認メールにご返信ください。');
    if (status !== 'ok') throw new Error('リンクからのキャンセルは受け付けていません。予約確認メールにご返信ください。');

    const when = formatRangeLabel_(ev.getStartTime(), ev.getEndTime());
    const name = ev.getTag('customerName') || '';
    const company = ev.getTag('company') || '';
    const email = ev.getTag('customerEmail');
    const zoomId = ev.getTag('zoomMeetingId');
    const t = typeConf_(ev.getTag('bookingType'));
    const isPartner = t.MAIL === 'partner';

    ev.deleteEvent();
    if (zoomId) deleteZoomMeeting_(zoomId);
    PropertiesService.getScriptProperties().deleteProperty(CANCEL_PROP_PREFIX + token);

    const ownerEmail = CONFIG.OWNER_NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
    try {
      if (email) {
        MailApp.sendEmail({
          to: email,
          replyTo: ownerEmail,
          name: CONFIG.OWNER_NAME,
          subject: `【キャンセル受付】${isPartner ? 'お打ち合わせ' : '個別相談'} ${when}`,
          body: [
            greeting_(name, company),
            '',
            CONFIG.MAIL_INTRO,
            isPartner ? '以下のお打ち合わせのキャンセルを承りました。' : '以下のご予約のキャンセルをお受けしました。',
            '',
            `日時：${when}`,
            '',
            ...(isPartner
              ? ['別の日程をご希望の場合は、このメールにご返信ください。']
              : ['またご都合のよいときに、いつでもご予約ください。',
                '別の日程をご希望のときは、このメールにそのままご返信いただいても大丈夫です。']),
            '',
            signature_(),
          ].join('\n'),
        });
      }
      MailApp.sendEmail({
        to: ownerEmail,
        subject: `【キャンセル・${t.LABEL}】${when} ${company ? company + ' ' : ''}${name}様`,
        body: [
          'キャンセル用リンクから予約が取り消されました。',
          'カレンダーの予定とZoom会議は自動で削除済みです。',
          '',
          `種類：${t.LABEL}`,
          `日時：${when}`,
          ...(company ? [`会社名：${company}`] : []),
          `お名前：${name}`,
          `メール：${email || '不明'}`,
        ].join('\n'),
      });
    } catch (e) {
      console.error('キャンセルメール送信失敗: ' + e); // 取り消し自体は完了しているので画面には成功を返す
    }
    return { when: when };
  } finally {
    lock.releaseLock();
  }
}

/** 終わった予約のキャンセル用合言葉を片付ける（sendReminders から1日1回呼ばれる） */
function cleanupCancelTokens_() {
  const props = PropertiesService.getScriptProperties();
  const cal = getCalendar_(CONFIG.BOOKING_CALENDAR_ID);
  const now = Date.now();
  Object.keys(props.getProperties())
    .filter(k => k.indexOf(CANCEL_PROP_PREFIX) === 0)
    .forEach(k => {
      const ev = cal.getEventById(props.getProperty(k));
      if (!ev || ev.getEndTime().getTime() < now) props.deleteProperty(k);
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
  const type = typeKey_(f && f.type);
  const t = typeConf_(type);
  const d = {
    type: type,
    start: s(f && f.start),
    company: t.ASK_COMPANY ? s(f && f.company).slice(0, 80) : '',
    name: s(f && f.name).slice(0, 50),
    kana: s(f && f.kana).slice(0, 50),
    email: s(f && f.email).slice(0, 100),
    phone: s(f && f.phone).slice(0, 20),
    method: s(f && f.method),
    topics: (Array.isArray(f && f.topics) ? f.topics : []).map(s).filter(x => (t.TOPICS || []).indexOf(x) !== -1),
    note: s(f && f.note).slice(0, 1000),
    callTime: s(f && f.callTime).slice(0, 100),
  };
  const methodOk = CONFIG.METHODS.indexOf(d.method) !== -1 || (t.IN_PERSON && isInPerson_(d.method));
  if (!isInPerson_(d.method)) d.callTime = '';
  if (!d.start || isNaN(new Date(d.start).getTime())) throw new Error('日時を選択してください。');
  if (t.ASK_COMPANY && !d.company) throw new Error('会社名・団体名を入力してください。');
  if (!d.name) throw new Error('お名前を入力してください。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new Error('メールアドレスの形式をご確認ください。');
  if (!/^[0-9０-９\-－+() ]{10,20}$/.test(d.phone)) throw new Error('電話番号をご確認ください。');
  if (!methodOk) throw new Error('相談方法を選択してください。');
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
  CacheService.getScriptCache().remove('zoomToken'); // Zoomの権限を変えた直後でも、新しい認証で確かめる
  const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const z = createZoomMeeting_('【テスト】予約システム接続確認', start, CONFIG.SLOT_MINUTES);
  Logger.log('Zoom連携OK\n' + buildZoomText_(z));
  deleteZoomMeeting_(z.id);
  Logger.log('テスト会議は削除しました');
}
