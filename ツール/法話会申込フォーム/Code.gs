/**
 * 法話会 申込フォーム（Google Apps Script）
 *
 * - setup を1回実行すると、Googleフォームと回答用スプレッドシートを自動で作成
 * - 申込が入るたびに合計人数を数え、残席に合わせて「参加人数」の選択肢を自動で絞り、定員に達したら受付終了
 * - 申込締切の日時になったら自動で受付終了
 * - 申込者（メールアドレスの入力があれば）に受付確認メール、自分に通知メールを送信
 *
 * 設定はこの CONFIG だけを書き換えればOK。
 */
const CONFIG = {
  FORM_TITLE: '松島 法話の夜 参加申込',
  EVENT_NAME: '松島 法話の夜',
  SPEAKER: '奈良・薬師寺 副住職 大谷徹奘 師',
  DATE_TEXT: '2027年1月28日（木）19:00〜20:30（開場 18:30）',
  SHORT_DATE_TEXT: '1月28日・木',
  VENUE_TEXT: 'パレス松洲 大会議室（宮城郡松島町高城字浜38）',
  PARKING_NOTE: '駐車場に限りがあります。できるだけ乗り合わせでお越しください。',
  FEE_TEXT: '1,000円（当日受付にてお支払いください。おつりのいらないようご用意いただけますと幸いです）',

  // 定員と、1回の申込で受け付ける最大人数
  CAPACITY: 80,
  MAX_PER_APPLICATION: 5,

  // 申込締切（この日時に自動で受付終了）
  DEADLINE: '2027-01-25T23:59:59+09:00',
  DEADLINE_TEXT: '2027年1月25日（月）',

  // 主催者（フォーム・確認メールに表示）
  ORGANIZER_NAME: '小野 健汰',
  ORGANIZER_TEL: '080-1659-3872',
  OWNER_NOTIFY_EMAIL: '', // 空なら、このスクリプトのオーナー（自分）に通知

  AREA_CHOICES: ['松島町', '塩竈市・七ヶ浜町・利府町', '仙台市', '東松島市・大郷町・大和町'],
  ACCESS_CHOICES: ['自家用車', '電車（JR）', 'ご家族・知人の送迎', '徒歩・その他'],
  SOURCE_CHOICES: ['チラシ・ポスター', '回覧板', '町の広報誌', '知人・家族の紹介', 'SNS'],
};

// フォームの質問タイトル（回答の読み取りにも使うので、フォーム作成後は変えない）
const Q = {
  NAME: 'お名前',
  KANA: 'ふりがな',
  TEL: '電話番号',
  EMAIL: 'メールアドレス',
  COUNT: '参加人数',
  COMPANIONS: 'ご一緒に参加される方のお名前',
  AREA: 'お住まいの地域',
  ACCESS: '当日の交通手段',
  SOURCE: 'この会を何でお知りになりましたか',
  MESSAGE: '講師へのご質問・メッセージ',
  CONSENT: '個人情報の取扱いについて',
};

/** 最初に1回だけ実行：フォーム・回答シート・自動処理を作成 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FORM_ID')) {
    throw new Error('フォームは作成済みです。作り直す場合は resetSetup を実行してから setup を実行してください。');
  }

  const form = FormApp.create(CONFIG.FORM_TITLE);
  form.setDescription(buildFormDescription_())
    .setConfirmationMessage(
      'お申込みありがとうございました。受付が完了しました。\n' +
      'メールアドレスをご入力いただいた方には、受付確認メールをお送りしています。\n' +
      '当日は受付にてお名前をお伝えください。')
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false)
    .setCollectEmail(false);

  form.addTextItem().setTitle(Q.NAME).setRequired(true);
  form.addTextItem().setTitle(Q.KANA).setRequired(true);
  form.addTextItem().setTitle(Q.TEL)
    .setHelpText('当日までにご連絡が必要な場合に使用します（例：090-1234-5678）')
    .setRequired(true)
    .setValidation(FormApp.createTextValidation()
      .requireTextMatchesPattern('^[0-9０-９\\-－ー ]{10,15}$')
      .setHelpText('数字とハイフンで入力してください')
      .build());
  form.addTextItem().setTitle(Q.EMAIL)
    .setHelpText('ご入力いただくと、受付確認メールをお送りします（任意）')
    .setValidation(FormApp.createTextValidation()
      .requireTextIsEmail()
      .setHelpText('メールアドレスの形式で入力してください')
      .build());
  form.addListItem().setTitle(Q.COUNT)
    .setHelpText('ご本人を含めた人数を選んでください')
    .setChoiceValues(countChoices_(CONFIG.MAX_PER_APPLICATION))
    .setRequired(true);
  form.addParagraphTextItem().setTitle(Q.COMPANIONS)
    .setHelpText('2名以上でお申込みの場合のみご記入ください');
  form.addMultipleChoiceItem().setTitle(Q.AREA)
    .setChoiceValues(CONFIG.AREA_CHOICES)
    .showOtherOption(true);
  form.addMultipleChoiceItem().setTitle(Q.ACCESS)
    .setHelpText('駐車場の準備に使用します')
    .setChoiceValues(CONFIG.ACCESS_CHOICES);
  form.addCheckboxItem().setTitle(Q.SOURCE)
    .setChoiceValues(CONFIG.SOURCE_CHOICES)
    .showOtherOption(true);
  form.addParagraphTextItem().setTitle(Q.MESSAGE)
    .setHelpText('当日の参考にさせていただきます（任意）');
  form.addCheckboxItem().setTitle(Q.CONSENT)
    .setHelpText('ご記入いただいた個人情報は、本法話会の参加受付とご連絡のためにのみ使用し、それ以外の目的には使用しません。')
    .setChoiceValues(['同意する'])
    .setRequired(true);

  const ss = SpreadsheetApp.create(CONFIG.FORM_TITLE + '（回答）');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  props.setProperties({ FORM_ID: form.getId(), SHEET_ID: ss.getId() });

  ScriptApp.newTrigger('handleSubmit').forForm(form).onFormSubmit().create();
  const deadline = new Date(CONFIG.DEADLINE);
  if (deadline > new Date()) {
    ScriptApp.newTrigger('closeAtDeadline').timeBased().at(deadline).create();
  }

  const url = form.getPublishedUrl();
  Logger.log('■ 申込フォーム（お客様用・チラシのQRコードに使う）: ' + form.shortenFormUrl(url));
  Logger.log('■ フォームの編集画面: ' + form.getEditUrl());
  Logger.log('■ 回答スプレッドシート: ' + ss.getUrl());
}

/** 申込が入るたびに自動実行（setup が設定） */
function handleSubmit(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const form = getForm_();
    const answers = toAnswerMap_(e.response);
    const total = countAttendees_(form);
    updateCapacity_(form, total);
    sendConfirmation_(answers);
    notifyOwner_(answers, total);
  } finally {
    lock.releaseLock();
  }
}

/** 締切日時に自動実行（setup が設定） */
function closeAtDeadline() {
  const form = getForm_();
  form.setAcceptingResponses(false)
    .setCustomClosedFormMessage(
      '申込受付は締め切りました。\n' +
      'お問合せ：主催 ' + CONFIG.ORGANIZER_NAME + '（TEL ' + CONFIG.ORGANIZER_TEL + '）');
  const total = countAttendees_(form);
  MailApp.sendEmail({
    to: ownerEmail_(),
    subject: '【' + CONFIG.EVENT_NAME + '】申込受付を締め切りました（' + total + '名）',
    body: '申込締切になったため、フォームの受付を終了しました。\n\n' +
      '申込人数の合計：' + total + '名 / 定員 ' + CONFIG.CAPACITY + '名\n\n' +
      '回答一覧：' + SpreadsheetApp.openById(sheetId_()).getUrl(),
  });
}

/** 現在の申込人数を確認したいときに実行（実行ログに表示） */
function showStatus() {
  const form = getForm_();
  const total = countAttendees_(form);
  Logger.log('申込件数：' + form.getResponses().length + '件');
  Logger.log('参加人数の合計：' + total + '名 / 定員 ' + CONFIG.CAPACITY + '名（残り ' + Math.max(0, CONFIG.CAPACITY - total) + '名）');
  Logger.log('受付中：' + (form.isAcceptingResponses() ? 'はい' : 'いいえ'));
}

/** キャンセルで回答を削除したあとなどに実行：人数を数え直して受付を再開 */
function reopenForm() {
  const form = getForm_();
  if (new Date() > new Date(CONFIG.DEADLINE)) {
    throw new Error('申込締切を過ぎているため再開しません。再開したい場合は CONFIG の DEADLINE を変更してください。');
  }
  form.setAcceptingResponses(true);
  updateCapacity_(form, countAttendees_(form));
  showStatus();
}

/** CONFIG の DEADLINE を変更したあとに実行：自動締切の日時を付け替える */
function updateDeadline() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'closeAtDeadline')
    .forEach(t => ScriptApp.deleteTrigger(t));
  const deadline = new Date(CONFIG.DEADLINE);
  if (deadline <= new Date()) throw new Error('DEADLINE が過去の日時になっています。');
  ScriptApp.newTrigger('closeAtDeadline').timeBased().at(deadline).create();
  Logger.log('自動締切を ' + deadline.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + ' に設定しました。フォームの説明文の締切日は編集画面で直してください。');
}

/** 自動処理を止めて、作り直せる状態に戻す（フォームとスプレッドシート自体は削除しない） */
function resetSetup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log('自動処理を停止しました。古いフォームが不要ならGoogleドライブから削除してください。');
}

function buildFormDescription_() {
  return [
    CONFIG.SPEAKER + 'をお迎えし、法話会を開催します。どなたでもお気軽にご参加ください。',
    '',
    '■ 日時：' + CONFIG.DATE_TEXT,
    '■ 会場：' + CONFIG.VENUE_TEXT,
    '■ 参加費：' + CONFIG.FEE_TEXT,
    '■ 定員：' + CONFIG.CAPACITY + '名（先着順）',
    '■ 申込締切：' + CONFIG.DEADLINE_TEXT + '（定員に達し次第締切）',
    '※' + CONFIG.PARKING_NOTE,
    '',
    'お問合せ：主催 ' + CONFIG.ORGANIZER_NAME + '（TEL ' + CONFIG.ORGANIZER_TEL + '）',
  ].join('\n');
}

function countChoices_(max) {
  const choices = [];
  for (let i = 1; i <= max; i++) choices.push(i + '名');
  return choices;
}

/** 残席に合わせて人数の選択肢を絞る。満席なら受付終了 */
function updateCapacity_(form, total) {
  const remaining = CONFIG.CAPACITY - total;
  if (remaining <= 0) {
    form.setAcceptingResponses(false)
      .setCustomClosedFormMessage(
        '定員に達したため、申込受付を終了しました。たくさんのお申込みありがとうございました。\n' +
        'お問合せ：主催 ' + CONFIG.ORGANIZER_NAME + '（TEL ' + CONFIG.ORGANIZER_TEL + '）');
    return;
  }
  const item = form.getItems(FormApp.ItemType.LIST).find(i => i.getTitle() === Q.COUNT);
  item.asListItem().setChoiceValues(countChoices_(Math.min(CONFIG.MAX_PER_APPLICATION, remaining)));
}

/** フォームの全回答から参加人数を合計（スプレッドシートの行を消しても数は変わらない点に注意） */
function countAttendees_(form) {
  return form.getResponses().reduce((sum, r) => {
    const a = toAnswerMap_(r);
    return sum + (parseInt(a[Q.COUNT], 10) || 0);
  }, 0);
}

function toAnswerMap_(response) {
  const map = {};
  response.getItemResponses().forEach(ir => {
    const v = ir.getResponse();
    map[ir.getItem().getTitle()] = Array.isArray(v) ? v.join('、') : String(v);
  });
  return map;
}

function sendConfirmation_(a) {
  if (!a[Q.EMAIL]) return;
  MailApp.sendEmail({
    to: a[Q.EMAIL],
    name: CONFIG.ORGANIZER_NAME,
    subject: '【受付完了】' + CONFIG.EVENT_NAME + '（' + CONFIG.SHORT_DATE_TEXT + '）',
    body: a[Q.NAME] + ' 様\n\n' +
      'このたびは「' + CONFIG.EVENT_NAME + '」にお申込みいただき、ありがとうございます。\n' +
      '以下の内容で受付いたしました。\n\n' +
      '■ 日時：' + CONFIG.DATE_TEXT + '\n' +
      '■ 会場：' + CONFIG.VENUE_TEXT + '\n' +
      '■ 参加費：' + CONFIG.FEE_TEXT + '\n' +
      '■ お申込み人数：' + a[Q.COUNT] + '\n\n' +
      '当日は受付にてお名前をお伝えください。\n' +
      CONFIG.PARKING_NOTE + '\n' +
      '夜間の開催です。暖かい服装で、お足元に十分ご注意のうえお越しください。\n\n' +
      'ご都合が悪くなった場合は、お手数ですが下記までご連絡ください。\n\n' +
      '主催：' + CONFIG.ORGANIZER_NAME + '\n' +
      'TEL：' + CONFIG.ORGANIZER_TEL + '\n',
  });
}

function notifyOwner_(a, total) {
  const over = total > CONFIG.CAPACITY
    ? '\n※定員を ' + (total - CONFIG.CAPACITY) + '名超えています（同時に申込があったため）。調整のご連絡をお願いします。\n'
    : '';
  const lines = Object.keys(Q)
    .map(k => Q[k])
    .filter(title => title !== Q.CONSENT)
    .map(title => '・' + title + '：' + (a[title] || '（未記入）'));
  MailApp.sendEmail({
    to: ownerEmail_(),
    subject: '【' + CONFIG.EVENT_NAME + '】申込：' + a[Q.NAME] + ' 様 ' + a[Q.COUNT] + '（合計 ' + total + '/' + CONFIG.CAPACITY + '名）',
    body: '新しい申込がありました。\n\n' +
      lines.join('\n') + '\n\n' +
      '参加人数の合計：' + total + '名 / 定員 ' + CONFIG.CAPACITY + '名（残り ' + Math.max(0, CONFIG.CAPACITY - total) + '名）\n' +
      over + '\n' +
      '回答一覧：' + SpreadsheetApp.openById(sheetId_()).getUrl(),
  });
}

function getForm_() {
  const id = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!id) throw new Error('フォームがまだ作成されていません。先に setup を実行してください。');
  return FormApp.openById(id);
}

function sheetId_() {
  return PropertiesService.getScriptProperties().getProperty('SHEET_ID');
}

function ownerEmail_() {
  return CONFIG.OWNER_NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
}
