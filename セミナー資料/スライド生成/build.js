// 11/27 ミニセミナー スライド生成
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const gi = require("react-icons/gi");
const fs = require("fs");
const { applyTheme } = require(process.env.SKILL_DIR + "/scripts/apply_theme.js");

const OUT = process.argv[2] || "deck.pptx";

const THEME = {
  name: "やわらかセージ",
  headFontFace: "HG丸ｺﾞｼｯｸM-PRO",
  bodyFontFace: "メイリオ",
  colors: {
    dk1: "3D4A44", lt1: "FFFFFF", dk2: "4E7A66", lt2: "EEF6F1",
    accent1: "7DB59A", accent2: "F2A488", accent3: "F6D58E",
    accent4: "9EC5DD", accent5: "E07A6A", accent6: "B9B0DE",
    hlink: "4E7A66", folHlink: "8A7FB8",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625
pres.title = "入っているのに、受け取れない！？";
pres.author = "小野 健汰";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const HEAD = THEME.headFontFace;

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "TITLE_SLIDE",
  background: { color: C.background2 },
  objects: [],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  objects: [
    { text: { text: "入っているのに、受け取れない！？", options: { x: 0.5, y: 5.22, w: 5, h: 0.28, fontSize: 9, color: C.accent1, margin: 0 } } },
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.28, w: 9, h: 0.75, fontSize: 24, bold: false, color: C.text2, fontFace: HEAD, valign: "middle", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.3, fontSize: 9, color: C.accent1, align: "right" },
});

// ---------- helpers ----------
const ANIM = {}; // slideNo -> steps
let slideNo = 0;
let objSeq = 0;
let curSection = null;
function newSlide(masterName, section) {
  if (section !== curSection) { pres.addSection({ title: section }); curSection = section; }
  slideNo += 1;
  ANIM[slideNo] = [];
  return pres.addSlide({ masterName, sectionTitle: section });
}
function nm(prefix) { objSeq += 1; return `${prefix}_${objSeq}`; }
// step: {names:[], type:'click'|'with'|'after', effect:'fade'|'wipe'|'zoom'}
function anim(names, type = "click", effect = "fade") {
  ANIM[slideNo].push({ names: [].concat(names), type, effect });
}
function T(slide, text, opts) {
  const name = opts.objectName || nm("txt");
  slide.addText(text, Object.assign({ isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: "middle" }, opts, { objectName: name }));
  return name;
}
function S(slide, shape, opts) {
  const name = opts.objectName || nm("shp");
  slide.addShape(shape, Object.assign({}, opts, { objectName: name }));
  return name;
}
function card(slide, opts) { // rounded card with text
  const name = opts.objectName || nm("card");
  slide.addText(opts.text, Object.assign({
    shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.15, isTextBox: true,
    fontSize: 14, color: C.text1, valign: "middle", margin: [6, 10, 6, 10],
  }, opts, { objectName: name, text: undefined }));
  return name;
}
async function iconPng(Icon, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
async function icon(slide, Icon, { x, y, d, bg, fg = HEX.lt1, ratio = 0.55, name }) {
  const base = name || nm("icon");
  const c = S(slide, pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg }, objectName: base + "_bg" });
  const s = d * ratio;
  const imgName = base + "_img";
  slide.addImage({ data: await iconPng(Icon, fg), x: x + (d - s) / 2, y: y + (d - s) / 2, w: s, h: s, objectName: imgName, altText: "" });
  return [c, imgName];
}
function foot(slide, text) {
  return T(slide, text, { x: 0.5, y: 4.88, w: 9, h: 0.28, fontSize: 10, color: "7A8A83" });
}
// insurance bar chart drawn with shapes
function coverageBox(slide, { x, y, w, h, label = "5,000万円", ages, endAge = 65, fill = C.accent1 }) {
  const names = [];
  names.push(S(slide, pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill, transparency: 55 }, line: { color: C.accent1, width: 1.5 } }));
  names.push(T(slide, label, { x, y: y + h / 2 - 0.3, w, h: 0.6, fontSize: 24, color: C.text2, align: "center", fontFace: HEAD }));
  return names;
}
function ageLabel(slide, text, cx, y, color = C.text1, bold = false) {
  return T(slide, text, { x: cx - 0.4, y, w: 0.8, h: 0.3, fontSize: 12, align: "center", color, bold });
}

(async () => {
  // =========== 1. 表紙 ===========
  let s = newSlide("TITLE_SLIDE", "オープニング");
  S(s, pres.shapes.OVAL, { x: 6.6, y: -1.2, w: 4.6, h: 4.6, fill: { color: C.accent1, transparency: 75 }, line: { color: C.accent1, transparency: 75 }, objectName: "deco1" });
  S(s, pres.shapes.OVAL, { x: -0.8, y: 4.3, w: 2.2, h: 2.2, fill: { color: C.accent2, transparency: 70 }, line: { color: C.accent2, transparency: 70 }, objectName: "deco2" });
  S(s, pres.shapes.OVAL, { x: 8.6, y: 4.1, w: 0.9, h: 0.9, fill: { color: C.accent3, transparency: 40 }, line: { color: C.accent3, transparency: 40 }, objectName: "deco3" });
  const ic1 = await icon(s, fa.FaHandHoldingHeart, { x: 7.0, y: 1.35, d: 2.1, bg: C.background1, fg: HEX.accent2, name: "t_icon" });
  const t1 = T(s, "知っているかどうかで大きく変わる", { x: 0.7, y: 0.95, w: 6, h: 0.4, fontSize: 16, color: C.accent1, fontFace: HEAD });
  const t2 = T(s, [{ text: "入っているのに、", options: { breakLine: true } }, { text: "受け取れない！？" }],
    { x: 0.7, y: 1.4, w: 6.2, h: 1.6, fontSize: 38, color: C.text2, fontFace: HEAD, valign: "top" });
  const t3 = T(s, "〜 \"備え\"の使い方 20分講座 〜", { x: 0.7, y: 3.05, w: 6, h: 0.45, fontSize: 18, color: C.text1, fontFace: HEAD });
  const t4 = card(s, { text: "2026.11.27（金）オンライン\n講師：小野 健汰（元看護師・保健師・ケアマネのFP）", x: 0.7, y: 3.95, w: 5.9, h: 0.86, fontSize: 13, fill: { color: C.background1 }, line: { color: C.accent1, width: 1 }, color: C.text2 });
  anim([t1, t2], "after");
  anim([t3], "after");
  anim(ic1.concat([t4]), "after");
  s.addNotes("「今日は『この商品がいいですよ』という話は一切ありません。最後に参加者限定の特典もご用意しています。20分、気楽に聞いてください。」");

  // =========== 2. 講師紹介 ===========
  s = newSlide("CONTENT", "オープニング");
  s.addText("講師紹介", { placeholder: "title" });
  const pIc = await icon(s, fa.FaUserNurse, { x: 0.95, y: 1.25, d: 1.7, bg: C.accent1, name: "p_icon" });
  const pName = T(s, "小野 健汰", { x: 0.5, y: 3.1, w: 2.6, h: 0.5, fontSize: 22, align: "center", fontFace: HEAD, color: C.text2 });
  const pOrg = T(s, [{ text: "Gift Your Life株式会社 仙台支社", options: { breakLine: true } }, { text: "ファイナンシャルプランナー" }],
    { x: 0.4, y: 3.6, w: 2.8, h: 0.6, fontSize: 11, align: "center", color: "6B7A73" });
  anim(pIc.concat([pName, pOrg]), "with");
  const rows = [
    [fa.FaHospital, C.accent2, "看護師・保健師・ケアマネとして、医療と介護の現場を経験"],
    [fa.FaHandHoldingHeart, C.accent1, "生保・損保・資産運用を、まとめてご相談いただけます"],
    [fa.FaMapMarkerAlt, C.accent4, "宮城県松島町在住。地域のジュニアスポーツの応援と家族でのおでかけが楽しみ"],
  ];
  for (let i = 0; i < rows.length; i++) {
    const y = 1.25 + i * 0.95;
    const bg = card(s, { text: "", x: 3.6, y, w: 5.9, h: 0.8, fill: { color: C.background2 }, line: { color: C.background2 } });
    const ic = await icon(s, rows[i][0], { x: 3.75, y: y + 0.12, d: 0.56, bg: rows[i][1] });
    const tx = T(s, rows[i][2], { x: 4.5, y: y + 0.05, w: 4.85, h: 0.7, fontSize: 14 });
    anim([bg].concat(ic, [tx]), "click");
  }
  const pMsg = card(s, { text: "備えは、使い方を知って、はじめて家族に届く", x: 3.6, y: 4.2, w: 5.9, h: 0.55, fill: { color: C.accent2, transparency: 25 }, line: { color: C.accent2, transparency: 25 }, fontSize: 15, align: "center", fontFace: HEAD, color: C.text1 });
  anim([pMsg], "click", "zoom");
  s.addNotes("「元々は看護師です。看護師やケアマネとして、病気や介護で暮らしが変わる場面に何度も立ち会ってきました。そこで感じたのは、備えはあっても、使い方を知らなければ家族に届かないということです。」");

  // =========== 3. クイズ① ===========
  s = newSlide("CONTENT", "① 損保のサプライズ");
  s.addText("クイズ①　自分の車で、自宅の門を壊したら？", { placeholder: "title" });
  const q1a = await icon(s, fa.FaCarSide, { x: 0.7, y: 1.3, d: 1.3, bg: C.accent4, name: "q1car" });
  const q1b = await icon(s, gi.GiGate, { x: 2.1, y: 1.3, d: 1.3, bg: C.accent3, fg: HEX.dk2, name: "q1gate" });
  const q1t = card(s, { text: "車をバックで駐車場に入れたら、じゃばらの門に引っかけて曲げてしまった…", x: 0.6, y: 2.85, w: 3.0, h: 1.3, fill: { color: C.background2 }, line: { color: C.background2 }, fontSize: 13 });
  anim(q1a.concat(q1b, [q1t]), "with");
  const q1q = T(s, "この門、自動車保険で直せる？", { x: 4.1, y: 1.25, w: 5.4, h: 0.55, fontSize: 20, fontFace: HEAD, color: C.text2 });
  const cA = card(s, { text: "A　直せる", x: 4.1, y: 2.0, w: 2.55, h: 0.75, fill: { color: C.accent4, transparency: 40 }, line: { color: C.accent4 }, fontSize: 20, align: "center", fontFace: HEAD });
  const cB = card(s, { text: "B　直せない", x: 6.95, y: 2.0, w: 2.55, h: 0.75, fill: { color: C.accent2, transparency: 40 }, line: { color: C.accent2 }, fontSize: 20, align: "center", fontFace: HEAD });
  const chat1 = T(s, "チャットで「A」か「B」をどうぞ", { x: 4.1, y: 2.85, w: 5.4, h: 0.35, fontSize: 12, color: "7A8A83", align: "center" });
  anim([q1q, cA, cB, chat1], "click");
  const ans1 = card(s, { text: "答え：B　直せない", x: 4.1, y: 3.4, w: 5.4, h: 0.6, fill: { color: C.accent5 }, line: { color: C.accent5 }, color: C.background1, fontSize: 20, align: "center", fontFace: HEAD });
  const exp1 = T(s, "自動車保険の「対物賠償」は、他人の物を壊したときの補償。自分の物は対象外です。", { x: 4.1, y: 4.1, w: 5.4, h: 0.6, fontSize: 13 });
  anim([ans1], "click", "zoom");
  anim([exp1], "after");
  s.addNotes("車をバックで入れたら、じゃばらの門に引っかけて曲げてしまった。この門は自動車保険で直せる？直せない？（チャットで）\n→答えは『直せない』。自動車保険の対物は正式には『対物賠償責任保険』。賠償は他人の物を壊したときのもの。自宅の駐車場で自分の物を壊したので対象外。ディーラーさんに聞いても『それは出ないですね』で終わってしまう話です。\n→「近くの工務店に頼むか、ホームセンターで門を買ってきて、自腹で直す。皆さんそうされますよね…」");

  // =========== 4. クイズ② ===========
  s = newSlide("CONTENT", "① 損保のサプライズ");
  s.addText("クイズ②　では、火災保険なら？", { placeholder: "title" });
  const hIc = await icon(s, fa.FaHome, { x: 0.8, y: 1.45, d: 1.6, bg: C.accent1, name: "q2home" });
  const hTx = T(s, "火災保険は「家」の備え。\n火事や水災のときに使うもの…", { x: 0.5, y: 3.2, w: 2.6, h: 0.9, fontSize: 13, align: "center" });
  anim(hIc.concat([hTx]), "with");
  // mock policy
  const pol = card(s, { text: "", x: 3.6, y: 1.3, w: 5.9, h: 2.5, fill: { color: C.background1 }, line: { color: C.accent1, width: 1.25 }, shadow: { type: "outer", color: "9FB8AC", opacity: 0.35, blur: 6, offset: 2, angle: 90 } });
  const polH = T(s, "火災保険　証券（イメージ）", { x: 3.85, y: 1.42, w: 5.4, h: 0.45, fontSize: 15, fontFace: HEAD, color: C.text2 });
  const polL1 = T(s, "保険の対象　　　建物", { x: 3.85, y: 2.0, w: 5.4, h: 0.4, fontSize: 14 });
  const polL2 = T(s, "補償の内容　　　火災・風災・水災 ほか", { x: 3.85, y: 2.45, w: 5.4, h: 0.4, fontSize: 14 });
  anim([pol, polH, polL1, polL2], "click");
  const hl = card(s, { text: "建物に含むもの　門・塀・車庫", x: 3.75, y: 3.0, w: 5.6, h: 0.55, fill: { color: C.accent3 }, line: { color: C.accent3 }, fontSize: 16, bold: true, fontFace: HEAD });
  anim([hl], "click", "wipe");
  const ans2 = card(s, { text: "契約内容によっては、火災保険で直せることも！", x: 3.6, y: 4.0, w: 5.9, h: 0.6, fill: { color: C.accent5 }, line: { color: C.accent5 }, color: C.background1, fontSize: 17, align: "center", fontFace: HEAD });
  anim([ans2], "click", "zoom");
  foot(s, "※補償の範囲・自己負担額などは、保険会社・契約内容によって異なります");
  s.addNotes("「一軒家の方は、普通は火災保険に入っていますよね。火災保険は家本体の保険。ところが、証券を見てもらうと『門・塀を含む』と書いてあることがあるんです。」\n→自分で自分の家の門を壊したのに、自動車保険ではなく火災保険から直せる場合がある。「ご存じでしたか？」（チャット）\n※断定しない：『契約内容によっては』と必ず添える。");

  // =========== 5. 請求漏れ ===========
  s = newSlide("CONTENT", "① 損保のサプライズ");
  s.addText("これを「請求漏れ」といいます", { placeholder: "title" });
  const steps = ["知らない", "連絡しない", "担当者も\n気づけない", "自腹で\n直す"];
  const stepCol = [C.accent4, C.accent1, C.accent3, C.accent2];
  for (let i = 0; i < steps.length; i++) {
    const x = 0.55 + i * 2.32;
    const b = card(s, { text: steps[i], x, y: 1.45, w: 1.85, h: 1.25, fill: { color: stepCol[i], transparency: i === 3 ? 0 : 35 }, line: { color: stepCol[i] }, fontSize: 17, align: "center", fontFace: HEAD, color: C.text1 });
    const names = [b];
    if (i > 0) {
      const ar = S(s, pres.shapes.RIGHT_ARROW, { x: x - 0.42, y: 1.88, w: 0.34, h: 0.4, fill: { color: C.accent1 }, line: { color: C.accent1 } });
      names.unshift(ar);
    }
    anim(names, i === 0 ? "click" : "after", "wipe");
  }
  const m5a = T(s, "誰も悪くないのに、損をするのは入っている本人だけ", { x: 0.5, y: 3.05, w: 9, h: 0.6, fontSize: 21, fontFace: HEAD, color: C.accent5, align: "center" });
  anim([m5a], "click");
  const [l5a, l5b] = await icon(s, fa.FaLightbulb, { x: 1.4, y: 3.9, d: 0.6, bg: C.accent3, fg: HEX.dk2 });
  const m5b = T(s, "迷ったら、まず相談。自己判断がいちばんもったいない", { x: 2.15, y: 3.9, w: 7, h: 0.6, fontSize: 16 });
  anim([l5a, l5b, m5b], "click");
  s.addNotes("「知らなかったらどうなるか。自分で直すしかないですよね。これを『請求漏れ』といいます。」\n→この方は火災保険で直せることを知らない→火災保険の担当者に連絡しない→担当者は門が壊れたことを知りようがない。\n「これって誰も悪意はないんです。でも実害はご本人だけ。」\n「迷ったら、とにかく連絡をください。こういうものは素人判断がいちばんいけないと思うんです。」");

  // =========== 6. 生保だと ===========
  s = newSlide("CONTENT", "② 生保のサプライズ");
  s.addText("これが、生命保険で起きたら？", { placeholder: "title" });
  const lc = card(s, { text: "", x: 0.9, y: 1.4, w: 3.4, h: 2.4, fill: { color: C.background2 }, line: { color: C.background2 } });
  const lt = T(s, "損害保険の請求漏れ", { x: 0.9, y: 1.6, w: 3.4, h: 0.4, fontSize: 15, align: "center", color: "6B7A73" });
  const lv = T(s, "10万〜20万円", { x: 0.9, y: 2.3, w: 3.4, h: 0.9, fontSize: 30, align: "center", fontFace: HEAD, color: C.text2 });
  anim([lc, lt, lv], "click");
  const ar6 = S(s, pres.shapes.RIGHT_ARROW, { x: 4.55, y: 2.35, w: 0.8, h: 0.55, fill: { color: C.accent2 }, line: { color: C.accent2 } });
  const rc = card(s, { text: "", x: 5.6, y: 1.4, w: 3.5, h: 2.4, fill: { color: C.accent5, transparency: 10 }, line: { color: C.accent5 } });
  const rt = T(s, "生命保険の請求漏れ", { x: 5.6, y: 1.6, w: 3.5, h: 0.4, fontSize: 15, align: "center", color: C.background1 });
  const rv = T(s, "数千万円", { x: 5.6, y: 2.2, w: 3.5, h: 1.1, fontSize: 44, align: "center", fontFace: HEAD, color: C.background1 });
  anim([ar6], "click", "wipe");
  anim([rc, rt, rv], "after", "zoom");
  const m6 = T(s, "取り返しのつかない金額になってしまいます", { x: 0.5, y: 4.15, w: 9, h: 0.5, fontSize: 18, align: "center", fontFace: HEAD });
  anim([m6], "click");
  s.addNotes("「今のが損害保険の話。実は生命保険でも同じような話がたくさん起きます。損保なら10万、20万の話。でも生命保険で起きると数千万円単位。取り返しがつかないですよね。少しだけ、そんなお話をさせてください。」");

  // =========== 7. よくある形 ===========
  s = newSlide("CONTENT", "② 生保のサプライズ");
  s.addText("よくある生命保険の形", { placeholder: "title" });
  const box7 = coverageBox(s, { x: 0.8, y: 1.35, w: 4.6, h: 2.5 });
  const a35 = ageLabel(s, "35歳", 0.8, 3.95), a65 = ageLabel(s, "65歳", 5.4, 3.95);
  anim(box7.concat([a35, a65]), "click");
  const q7a = card(s, { text: "64歳で亡くなったら？", x: 6.0, y: 1.35, w: 3.5, h: 0.6, fill: { color: C.background2 }, line: { color: C.background2 }, fontSize: 15 });
  const a7a = T(s, "→ 5,000万円", { x: 6.0, y: 2.0, w: 3.5, h: 0.5, fontSize: 20, fontFace: HEAD, color: C.text2, align: "right" });
  const q7b = card(s, { text: "66歳で亡くなったら？", x: 6.0, y: 2.7, w: 3.5, h: 0.6, fill: { color: C.background2 }, line: { color: C.background2 }, fontSize: 15 });
  const a7b = T(s, "→ 0円", { x: 6.0, y: 3.35, w: 3.5, h: 0.5, fontSize: 20, fontFace: HEAD, color: C.accent5, align: "right" });
  anim([q7a], "click"); anim([a7a], "click");
  anim([q7b], "click"); anim([a7b], "click");
  const m7 = T(s, "ここまでは、当たり前ですよね", { x: 0.5, y: 4.4, w: 9, h: 0.45, fontSize: 16, align: "center", color: "6B7A73" });
  anim([m7], "click");
  s.addNotes("「35歳で加入して65歳まで、5,000万円の保障。だいたい保険ってこんな形ですよね。」\n「65歳までに亡くなったら？」→5,000万円。「66歳だったら？」→0円。\n「70歳までにしておけばよかったなぁ…と後悔はするかもしれないけど、まぁ仕方ないかな、という話ですよね。」");

  // =========== 8. 余命宣告 ===========
  s = newSlide("CONTENT", "② 生保のサプライズ");
  s.addText("63歳で、がん・余命宣告を受けたら", { placeholder: "title" });
  const box8 = coverageBox(s, { x: 0.6, y: 1.55, w: 4.2, h: 2.2 });
  const b35 = ageLabel(s, "35歳", 0.6, 3.85), b63 = ageLabel(s, "63歳", 4.25, 3.85, C.accent5, true), b65 = ageLabel(s, "65歳", 4.8, 3.85);
  anim(box8.concat([b35, b65]), "with");
  const bub = T(s, "がん・余命宣告", { shape: pres.shapes.WEDGE_ROUND_RECT_CALLOUT, x: 3.0, y: 1.05, w: 1.8, h: 0.55, fill: { color: C.accent5 }, line: { color: C.accent5 }, color: C.background1, fontSize: 13, align: "center", fontFace: HEAD });
  anim([bub, b63], "click", "zoom");
  const k1 = card(s, { text: [{ text: "65歳の満了時は元気だった", options: { bold: true, breakLine: true } }, { text: "→ 66歳で0円は「仕方ない」と思える" }], x: 5.4, y: 1.3, w: 4.1, h: 1.05, fill: { color: C.background2 }, line: { color: C.background2 }, fontSize: 13 });
  const k2 = card(s, { text: [{ text: "「あと2年で切れる」とわかっている", options: { bold: true, breakLine: true } }, { text: "→ 同じ0円でも、意味がまったく違う" }], x: 5.4, y: 2.55, w: 4.1, h: 1.05, fill: { color: C.accent2, transparency: 45 }, line: { color: C.accent2 }, fontSize: 13 });
  anim([k1], "click"); anim([k2], "click");
  const m8 = card(s, { text: "本人も家族も長生きを願う。でも万一のときは、家族に届けたい", x: 0.6, y: 4.3, w: 8.9, h: 0.5, fill: { color: C.background1 }, line: { color: C.accent1, width: 1 }, fontSize: 14, align: "center" });
  anim([m8], "click");
  s.addNotes("「同じ保険で、少しだけ条件を変えます。この方が63歳でがんになり、余命宣告を受けたとします。」\n「65歳を1日超えて亡くなったら？」→0円。さっきと同じに聞こえますが、まったく違います。\n前者は満了時に自分は健康だと思っていた。後者は『あと2年で切れる』とわかっている。誰もが長生きしたいと治療に向き合う。家族も長生きしてほしい。でも万一のときは保険金を家族に届けたい。\n「…それって、とても辛いですよね。」（少し沈黙）\n※参加者に当事者やご家族がいる前提で、看護師としての敬意をもって話す。");

  // =========== 9. 期間延長 ===========
  s = newSlide("CONTENT", "② 生保のサプライズ");
  s.addText("備えの期間は「延ばせる」ことがある", { placeholder: "title" });
  const box9 = coverageBox(s, { x: 0.6, y: 1.35, w: 3.6, h: 2.3 });
  const c35 = ageLabel(s, "35歳", 0.6, 3.75), c63 = ageLabel(s, "63歳", 3.65, 3.75, C.accent5, true), c65 = ageLabel(s, "65歳", 4.2, 3.75);
  anim(box9.concat([c35, c63, c65]), "with");
  const ext = S(s, pres.shapes.ROUNDED_RECTANGLE, { x: 4.2, y: 1.35, w: 1.3, h: 2.3, rectRadius: 0.08, fill: { color: C.accent3, transparency: 30 }, line: { color: C.accent3, width: 1.5, dashType: "dash" } });
  const arr9 = S(s, pres.shapes.RIGHT_ARROW, { x: 3.7, y: 2.2, w: 1.6, h: 0.6, fill: { color: C.accent2 }, line: { color: C.accent2 } });
  const c70 = ageLabel(s, "70歳", 5.5, 3.75, C.text2, true);
  anim([ext, arr9, c70], "click", "wipe");
  const pts9 = [
    [fa.FaComments, C.accent1, "保険会社に申し出て手続きすると、期間を延ばせる商品がある"],
    [fa.FaTimesCircle, C.accent5, "勝手には延びない。知らないと使えない"],
    [fa.FaRegClock, C.accent4, "申し出には期限がある（会社・商品により異なる）"],
  ];
  for (let i = 0; i < pts9.length; i++) {
    const y = 1.3 + i * 0.85;
    const ic = await icon(s, pts9[i][0], { x: 6.0, y: y + 0.08, d: 0.55, bg: pts9[i][1] });
    const tx = T(s, pts9[i][2], { x: 6.7, y, w: 2.85, h: 0.75, fontSize: 13 });
    anim(ic.concat([tx]), "click");
  }
  foot(s, "※期間延長の可否・期限・告知の要否・保険料は、保険会社・商品によって異なります");
  s.addNotes("「もし63歳でがんになって、66歳で亡くなっても保険金を満額受け取れたとしたら？」→良いですよね。実はそんなことができる場合があるんです。\n保険会社に『65歳まででいいと思っていたけど、63歳でがんになってしまった。70歳まで延ばしてもらえませんか』と申し出る。商品によっては『いいですよ』と延ばしてくれます（サラッと言う）。\n「70歳まで延ばせるとしたら、延ばしますか？」→延ばしますよね。\nでも、意外と使われていない。理由は『延ばせることを知らない』から。勝手には延びません。\n※期限（元台本では満了の2年前まで）は扱う会社で確認してから話す。");

  // =========== 10. 変換 ===========
  s = newSlide("CONTENT", "② 生保のサプライズ");
  s.addText("期限を過ぎていたら？「変換」という仕組み", { placeholder: "title" });
  const box10 = coverageBox(s, { x: 0.6, y: 1.35, w: 3.9, h: 2.3 });
  const d35 = ageLabel(s, "35歳", 0.6, 3.75), d65 = ageLabel(s, "65歳", 4.75, 3.75);
  anim(box10.concat([d35, d65]), "with");
  const red = S(s, pres.shapes.LINE, { x: 4.2, y: 1.15, w: 0, h: 2.6, line: { color: C.accent5, width: 2.5 } });
  const d64 = ageLabel(s, "64歳", 3.95, 3.75, C.accent5, true);
  const lbl10 = T(s, "64歳でがんが判明\n延長の期限は過ぎている…", { x: 1.0, y: 1.5, w: 3.0, h: 0.75, fontSize: 13, color: C.accent5, align: "right" });
  anim([red, d64], "click", "wipe");
  anim([lbl10], "after");
  const cv = card(s, { text: "", x: 5.1, y: 1.3, w: 4.4, h: 2.4, fill: { color: C.background2 }, line: { color: C.accent1, width: 1.5 } });
  const cvT = T(s, "変換", { x: 5.3, y: 1.45, w: 4.0, h: 0.7, fontSize: 32, fontFace: HEAD, color: C.text2 });
  const cvB = T(s, "健康状態を問わず、別の備えに切り替えられる仕組み", { x: 5.3, y: 2.2, w: 4.0, h: 0.8, fontSize: 16 });
  const cvS = T(s, "「明日切れる」とわかっていても、元気な人と同じ条件で入り直せるとしたら？", { x: 5.3, y: 2.95, w: 4.0, h: 0.7, fontSize: 12, color: "6B7A73" });
  anim([cv, cvT], "click", "zoom");
  anim([cvB], "after");
  anim([cvS], "click");
  const [cI1, cI2] = await icon(s, fa.FaComments, { x: 0.6, y: 4.05, d: 0.55, bg: C.accent2 });
  const ch10 = T(s, "この話、聞いたことはありましたか？（チャットでどうぞ）", { x: 1.3, y: 4.05, w: 8, h: 0.55, fontSize: 15 });
  anim([cI1, cI2, ch10], "click");
  foot(s, "※変換の可否・条件・変換後の保険料（その時の年齢で計算）は、保険会社・商品によって異なります");
  s.addNotes("「では、満了の1年前、64歳でがんがわかったら？期間延長の期限は過ぎています。それでも保険金を満額受け取れるとしたら？」→良いですよね。\nこの場合に使えるのが『変換』という仕組み。健康状態を問わず、別の保険に切り替えられる権利です。がんで余命宣告を受けていても、元気な人と同じ条件で入り直せる。\n「明日保険が切れるとき、入り直せるなら入りますよね。でも、これもやっていない方が本当に多いんです。」\n「この話、聞いたことはありましたか？」（チャット）→みなさん初めて聞いたとおっしゃいます。\n※変換後の保険料はその時の年齢で計算され上がることが多い。断定しない。");

  // =========== 11. 一覧にすると ===========
  s = newSlide("CONTENT", "③ 一覧表のご案内");
  s.addText("使える会社・使えない備えがあります", { placeholder: "title" });
  const docs = [["生命保険", C.accent1, 0.7, 1.4], ["火災保険", C.accent2, 2.2, 2.05], ["自動車保険", C.accent4, 0.95, 2.95]];
  const docNames = [];
  for (const [lab, col, x, y] of docs) {
    const ic = await icon(s, fa.FaFileAlt, { x, y, d: 0.85, bg: col });
    const tx = T(s, lab, { x: x - 0.3, y: y + 0.9, w: 1.45, h: 0.3, fontSize: 11, align: "center" });
    docNames.push(...ic, tx);
  }
  const bara = T(s, "バラバラだと、全体が見えない", { x: 0.4, y: 4.25, w: 3.4, h: 0.4, fontSize: 13, align: "center", color: "6B7A73" });
  anim(docNames.concat([bara]), "click");
  const ar11 = S(s, pres.shapes.RIGHT_ARROW, { x: 3.95, y: 2.35, w: 1.0, h: 0.6, fill: { color: C.accent3 }, line: { color: C.accent3 } });
  const list11 = await icon(s, fa.FaClipboardList, { x: 5.3, y: 1.45, d: 1.6, bg: C.text2 });
  const list11t = T(s, "ひとつの一覧にすると", { x: 4.9, y: 3.15, w: 2.4, h: 0.35, fontSize: 13, align: "center" });
  anim([ar11], "click", "wipe");
  anim(list11.concat([list11t]), "after", "zoom");
  const chk = ["保障はいつまで？", "延長・変換は使える？", "請求漏れはない？"];
  const chkNames = [];
  for (let i = 0; i < chk.length; i++) {
    const y = 1.45 + i * 0.62;
    const ic = await icon(s, fa.FaCheckCircle, { x: 7.45, y, d: 0.45, bg: C.background1, fg: HEX.accent1, ratio: 0.95 });
    const tx = T(s, chk[i], { x: 7.95, y: y - 0.02, w: 1.75, h: 0.5, fontSize: 12 });
    chkNames.push(...ic, tx);
  }
  anim(chkNames, "after");
  const q11 = card(s, { text: "ご自分の備え、どうなっていますか？", x: 4.9, y: 3.75, w: 4.6, h: 0.6, fill: { color: C.accent2, transparency: 30 }, line: { color: C.accent2 }, fontSize: 15, align: "center", fontFace: HEAD });
  anim([q11], "click");
  foot(s, "※期間延長・変換などの仕組みは、保険会社や商品によって使えるものと使えないものがあります");
  s.addNotes("「実は、今日お話しした仕組みは、できる会社とできない会社、できる保険とできない保険があるんです。」\n「ご自分の保険がどちらか、ご存じですか？」\n生保と損保を別々に持っていると、全体が見えない。ひとつの一覧にすると、保障の期限、延長・変換が使えるか、請求漏れがないかが見えてくる。");

  // =========== 12. 個別相談 ===========
  s = newSlide("CONTENT", "③ 一覧表のご案内");
  s.addText("参加者限定「わが家の備え一覧表」を無料で作成", { placeholder: "title" });
  const th = { fill: { color: C.text2 }, color: C.background1, bold: true, fontSize: 11, align: "center", valign: "middle" };
  const td = { fill: { color: C.background1 }, color: C.text1, fontSize: 11, align: "center", valign: "middle" };
  const tdA = { fill: { color: C.background2 }, color: C.text1, fontSize: 11, align: "center", valign: "middle" };
  const rowsT = [
    [{ text: "種類", options: th }, { text: "保障の期限", options: th }, { text: "延長・変換", options: th }, { text: "確認ポイント", options: th }],
    [{ text: "生命保険", options: td }, { text: "65歳まで", options: td }, { text: "延長〇／変換〇", options: td }, { text: "期限の確認", options: td }],
    [{ text: "医療保険", options: tdA }, { text: "一生涯", options: tdA }, { text: "―", options: tdA }, { text: "特約の期限", options: tdA }],
    [{ text: "火災保険", options: td }, { text: "○年まで", options: td }, { text: "―", options: td }, { text: "門・塀・車庫", options: td }],
  ];
  const tblName = nm("table");
  s.addTable(rowsT, { x: 0.5, y: 1.3, w: 5.0, colW: [1.1, 1.15, 1.4, 1.35], rowH: 0.42, border: { type: "solid", pt: 0.75, color: "D5E6DD" }, objectName: tblName });
  const tblCap = T(s, "一覧表のイメージ（記入例）", { x: 0.5, y: 3.05, w: 5.0, h: 0.3, fontSize: 10, color: "7A8A83" });
  anim([tblName, tblCap], "with");
  const det = [
    [fa.FaRegClock, C.accent1, "60分・オンライン（Zoom）"],
    [fa.FaHeart, C.accent2, "無料・無理なご提案はしません"],
    [fa.FaComments, C.accent4, "公式LINEから予約ページへ"],
  ];
  for (let i = 0; i < det.length; i++) {
    const y = 1.3 + i * 0.62;
    const ic = await icon(s, det[i][0], { x: 5.9, y, d: 0.48, bg: det[i][1] });
    const tx = T(s, det[i][2], { x: 6.5, y: y - 0.03, w: 3.0, h: 0.55, fontSize: 13 });
    anim(ic.concat([tx]), i === 0 ? "click" : "after");
  }
  const qr = card(s, { text: "公式LINEのQR\n（ここに貼る）", x: 7.85, y: 3.25, w: 1.6, h: 1.45, fill: { color: C.background1 }, line: { color: C.accent1, width: 1.25, dashType: "dash" }, fontSize: 11, align: "center", color: "7A8A83" });
  const qrIc = await icon(s, fa.FaQrcode, { x: 6.48, y: 3.35, d: 0.6, bg: C.text2 });
  const qrT = T(s, "QRコードか\nチャットのリンクから", { x: 5.85, y: 4.05, w: 1.85, h: 0.55, fontSize: 10, color: "6B7A73", valign: "top", align: "center" });
  anim([qr].concat(qrIc, [qrT]), "click");
  const last = card(s, { text: [{ text: "今日覚えてほしいのは、1つだけ", options: { breakLine: true, fontSize: 12 } }, { text: "備えが生きている間は、色々なことができる" }], x: 0.5, y: 3.55, w: 5.0, h: 1.1, fill: { color: C.accent3, transparency: 35 }, line: { color: C.accent3 }, fontSize: 14, fontFace: HEAD });
  anim([last], "click", "zoom");
  foot(s, "※表は記入例です。個別相談では、お手元の証券（写真でも可）をもとにお作りします");
  s.addNotes("「参加者の皆さま限定で、生保も損保もまとめた『わが家の備え一覧表』を無料でお作りします。いつまでの保障か、使える仕組みがあるか、請求漏れがないかが、ひと目でわかります。無理なご提案はしません。画面のQRコードか、チャットに貼るリンクから公式LINEを追加して、『一覧表』とひと言送ってください。すぐに予約ページが届きます。空いている日時を選ぶだけで、Zoomのリンクも自動で届きます。」\n「今日は内容を覚えなくて大丈夫です。備えが生きている間は色々なことができる、その1点だけ覚えて、何かあったらご連絡ください。」\n→このスライドを表示したまま質疑応答へ。最後に公式LINEのリンクをもう一度チャットに貼る。");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  fs.writeFileSync(OUT + ".anim.json", JSON.stringify(ANIM, null, 1));
  console.log("written", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
