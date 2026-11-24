/**
 * 毎朝5時ごろ、その日のGoogleカレンダーの予定を自分のLINEに送る
 *
 * 予約システムと同じ Apps Script プロジェクトに、このファイルを追加して使う
 * （CONFIG・getCalendar_・hmOf_ など Code.gs の部品を使っています）
 *
 * 準備（最初の1回だけ）
 *  1. LINE Developers で Messaging API のチャネルを作る（自分用。お客様向けの公式アカウントとは別がおすすめ）
 *  2. チャネルの「Messaging API設定」で チャネルアクセストークン（長期）を発行
 *  3. チャネルの「チャネル基本設定」の一番下にある「あなたのユーザーID」（U から始まる文字）を控える
 *  4. そのチャネルの公式アカウントを、自分のLINEで友だち追加する
 *  5. Apps Script の「プロジェクトの設定 → スクリプト プロパティ」に2つ登録
 *       LINE_CHANNEL_ACCESS_TOKEN … 2 のトークン
 *       LINE_USER_ID              … 3 のユーザーID
 *  6. testMorningLine を実行して、LINEに届くか確かめる
 *  7. setupMorningLine を1回実行（毎朝5時台に自動で送る設定ができる）
 */

const MORNING_LINE = {
  // 予定を読むカレンダー。予約の空き判定と同じものに、「家族（仕事OK）」なども足したければここに追加
  CALENDAR_IDS: CONFIG.CHECK_CALENDAR_IDS,
  // 送る時刻（時）。Googleの仕組み上、この時間の中のどこか（5:00〜5:59）で送られる
  HOUR: 5,
  // 予定がない日も送るか
  SEND_WHEN_EMPTY: true,
};

/** 毎朝自動で呼ばれる本体 */
function sendMorningSchedule() {
  const tz = CONFIG.TIME_ZONE;
  const now = new Date();
  const ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const dayStart = new Date(Utilities.formatDate(now, tz, "yyyy-MM-dd'T'00:00:00XXX"));
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const allDay = [];
  const timed = [];
  const seen = {};
  MORNING_LINE.CALENDAR_IDS.forEach(id => {
    getCalendar_(id).getEvents(dayStart, dayEnd).forEach(ev => {
      try {
        if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; // 不参加にした招待は出さない
      } catch (e) { /* 共有カレンダー等で取れないときはそのまま出す */ }

      // 同じ予定が複数のカレンダーに入っているときは1回だけ
      const key = (ev.getTitle() || '') + '|' + ev.getStartTime().getTime();
      if (seen[key]) return;
      seen[key] = true;

      if (ev.isAllDayEvent()) {
        allDay.push(ev.getTitle() || '（タイトルなし）');
      } else {
        timed.push(ev);
      }
    });
  });
  timed.sort((a, b) => a.getStartTime() - b.getStartTime());

  if (!allDay.length && !timed.length && !MORNING_LINE.SEND_WHEN_EMPTY) return;

  const w = '日月火水木金土'.charAt(Number(Utilities.formatDate(now, tz, 'u')) % 7);
  const lines = [`おはようございます☀️`, `${Utilities.formatDate(now, tz, 'M月d日')}（${w}）の予定`, ''];

  allDay.forEach(t => lines.push(`📌 終日　${t}`));
  timed.forEach(ev => {
    const start = ev.getStartTime();
    const end = ev.getEndTime();
    // 日をまたぐ予定は、今日の分だけ表示
    const s = start < dayStart ? '前日〜' : hmOf_(start);
    const e = end > dayEnd ? '翌日' : hmOf_(end);
    let line = `${s}〜${e}　${ev.getTitle() || '（タイトルなし）'}`;
    const place = ev.getLocation();
    if (place) line += `\n　　📍${place}`;
    lines.push(line);
  });
  if (!allDay.length && !timed.length) lines.push('予定はありません。ゆっくりいきましょう🍵');

  pushLine_(lines.join('\n').slice(0, 4900)); // LINEの1通の上限は5000文字
  Logger.log(`${ymd} の予定をLINEに送りました（${allDay.length + timed.length}件）`);
}

function pushLine_(text) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  const to = p.getProperty('LINE_USER_ID');
  if (!token || !to) {
    throw new Error('スクリプト プロパティに LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID が未登録です');
  }
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`LINE送信エラー(${res.getResponseCode()}): ${res.getContentText().slice(0, 200)}`);
  }
}

/** 試しに今すぐ送る */
function testMorningLine() {
  sendMorningSchedule();
}

/** 最初に一度だけ実行：毎朝5時台に自動で送る設定を作る（何度実行しても1つだけ） */
function setupMorningLine() {
  stopMorningLine();
  ScriptApp.newTrigger('sendMorningSchedule')
    .timeBased().everyDays(1).atHour(MORNING_LINE.HOUR).inTimezone(CONFIG.TIME_ZONE).create();
  Logger.log(`毎朝${MORNING_LINE.HOUR}時台に、その日の予定をLINEで送る設定をしました`);
}

/** 止めたいとき */
function stopMorningLine() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendMorningSchedule')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
