// 台本.json から「話す台本」の Word ファイルと、PowerPoint のノート用データ（notes.json）を作る
// 使い方: NODE_PATH=<docx を入れた node_modules> node build_docx.js [出力.docx] [notes.json の出力先]
// （docx は npm の "docx" パッケージ。v9 で確認）
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  Header, Footer, PageNumber, LevelFormat,
} = require('docx');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '台本.json'), 'utf8'));
const outDocx = process.argv[2] || path.join(__dirname, '..', '1127ミニセミナー_話す台本.docx');
const outNotes = process.argv[3] || null;

const FONT = { ascii: 'Meiryo', eastAsia: 'メイリオ', hAnsi: 'Meiryo', cs: 'Meiryo' };
const C = {
  green: '2F5D4A', greenBg: 'E5F0EA', line: 'A7C9B8', coral: 'B8452F', gray: '5F6E67',
  text: '1F1F1F', timeBg: 'FBF1D9', timeText: '5B4A12', boxBg: 'F4F8F6',
};
const PAGE = { w: 11906, h: 16838, margin: 1080 }; // A4・余白19mm
const CONTENT_W = PAGE.w - PAGE.margin * 2;
const LINE = { style: BorderStyle.SINGLE, size: 6, color: C.line };
const ALL_BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE };

const tr = (text, o = {}) => new TextRun({ text, font: FONT, ...o });

// ---- 台本の部品 ----
// keepNext: 直後のメモ（動き・時間）と同じページに置く
function sayPara(b, keepNext = false) {
  const lines = b.lines || [b.x];
  const runs = lines.map((l, i) => new TextRun(i === 0
    ? { text: l, font: FONT, size: 24, color: C.text }
    : { text: l, font: FONT, size: 24, color: C.text, break: 1 }));
  return new Paragraph({ children: runs, spacing: { before: 0, after: 160 }, keepNext });
}
function clickPara(b) {
  const runs = [tr('【クリック】', { size: 22, bold: true, color: C.coral })];
  if (b.x) runs.push(tr('（' + b.x + '）', { size: 20, color: C.coral }));
  return new Paragraph({ children: runs, spacing: { before: 40, after: 120 }, keepNext: true });
}
const notePara = (b) => new Paragraph({ children: [tr(b.x, { size: 20, color: C.gray })], spacing: { before: 0, after: 140 } });
const timePara = (b) => new Paragraph({
  children: [tr(b.x, { size: 20, color: C.timeText })],
  shading: { type: ShadingType.CLEAR, fill: C.timeBg, color: 'auto' },
  spacing: { before: 120, after: 160 },
});
const slideHead = (b) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [tr(b.x, { size: 24, bold: true, color: C.green })],
  shading: { type: ShadingType.CLEAR, fill: C.greenBg, color: 'auto' },
  spacing: { before: 280, after: 160 }, keepNext: true, keepLines: true,
});
const sectionHead = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1, pageBreakBefore: true,
  children: [tr(text, { size: 30, bold: true, color: C.green })],
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.line, space: 4 } },
  spacing: { before: 0, after: 240 }, keepNext: true,
});
const label = (text) => new Paragraph({
  children: [tr(text, { size: 23, bold: true, color: C.green })],
  spacing: { before: 240, after: 120 }, keepNext: true,
});
const spacer = (after = 120) => new Paragraph({ children: [], spacing: { after } });

function table(widths, rows) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    borders: ALL_BORDERS,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      children: r.map((t, ci) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA },
        shading: ri === 0 ? { type: ShadingType.CLEAR, fill: C.greenBg, color: 'auto' } : undefined,
        margins: { top: 80, bottom: 80, left: 140, right: 140 },
        children: [new Paragraph({ children: [tr(t, { size: 21, bold: ri === 0, color: ri === 0 ? C.green : C.text })] })],
      })),
    })),
  });
}
function box(lines) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    borders: ALL_BORDERS,
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: C.boxBg, color: 'auto' },
        margins: { top: 140, bottom: 140, left: 200, right: 200 },
        children: lines.map((l) => new Paragraph({ children: l ? [tr(l, { size: 21, color: C.text })] : [], spacing: { after: 40 } })),
      })],
    })],
  });
}

// ---- 表紙 ----
const children = [
  new Paragraph({ children: [tr(data.title, { size: 40, bold: true, color: C.green })], spacing: { after: 240 } }),
  new Paragraph({ children: [tr(data.seminarTitle, { size: 30, bold: true })], spacing: { after: 80 } }),
  new Paragraph({ children: [tr(data.subtitle, { size: 22, color: C.gray })], spacing: { after: 280 } }),
  new Paragraph({ children: [tr(data.speaker, { size: 22 })], spacing: { after: 40 } }),
  new Paragraph({ children: [tr(data.date, { size: 22 })], spacing: { after: 360 } }),
  new Paragraph({ children: [tr(data.lead, { size: 22 })], spacing: { after: 280 } }),
  label('記号の見方'),
  table([2100, CONTENT_W - 2100], [['記号', '意味'], ...data.legend]),
  spacer(200),
  label('時間配分'),
  table([1900, CONTENT_W - 1900 - 1500, 1500], [['時間', 'パート', 'スライド'], ...data.timeline]),
  spacer(),
];

// ---- 本文 ＋ ノート用データ ----
const notes = [];
const stats = [];
let cur = null;
for (const sec of data.sections) {
  children.push(sectionHead(sec.title));
  let chars = 0;
  for (const [bi, b] of sec.blocks.entries()) {
    const next = sec.blocks[bi + 1];
    if (b.t === 'slide') { children.push(slideHead(b)); cur = { n: b.n, lines: [] }; notes.push(cur); continue; }
    if (b.t === 'say') {
      children.push(sayPara(b, !!next && (next.t === 'note' || next.t === 'time')));
      chars += (b.lines || [b.x]).join('').length;
    }
    else if (b.t === 'click') children.push(clickPara(b));
    else if (b.t === 'note') children.push(notePara(b));
    else if (b.t === 'time') children.push(timePara(b));
    if (!cur) continue;
    if (b.t === 'say') cur.lines.push((b.lines || [b.x]).join('\u000b'));
    else if (b.t === 'click') cur.lines.push('▶クリック' + (b.x ? '（' + b.x + '）' : ''));
    else cur.lines.push(b.x);
  }
  stats.push({ section: sec.title, chars, minutesAt300: +(chars / 300).toFixed(1) });
}
for (const s of notes) {
  const i = s.lines.length - 1;
  if (s.lines[i] === '▶クリック') s.lines[i] = '▶クリック → 次のスライドへ';
}

// ---- 付録：公式LINE ----
children.push(sectionHead(data.appendix.title));
for (const b of data.appendix.blocks) {
  if (b.t === 'para') children.push(new Paragraph({ children: [tr(b.x, { size: 22 })], spacing: { after: 200 } }));
  else if (b.t === 'sub') children.push(new Paragraph({
    heading: HeadingLevel.HEADING_3, children: [tr(b.x, { size: 23, bold: true, color: C.green })],
    spacing: { before: 280, after: 120 }, keepNext: true,
  }));
  else if (b.t === 'box') { children.push(box(b.lines)); children.push(spacer()); }
  else if (b.t === 'check') children.push(new Paragraph({
    numbering: { reference: b.done ? 'done' : 'todo', level: 0 },
    children: [tr(b.x, { size: 22, color: b.done ? C.gray : C.text })], spacing: { after: 100 },
  }));
}

const checkLevel = (text) => [{
  level: 0, format: LevelFormat.BULLET, text, alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 480, hanging: 360 } }, run: { font: FONT } },
}];

const doc = new Document({
  title: data.title,
  styles: {
    default: {
      document: { run: { font: FONT, size: 22, color: C.text } },
      heading1: { run: { font: FONT, size: 30, bold: true, color: C.green }, paragraph: { spacing: { before: 0, after: 240 }, keepNext: true, keepLines: true } },
      heading2: { run: { font: FONT, size: 24, bold: true, color: C.green }, paragraph: { spacing: { before: 280, after: 160 }, keepNext: true, keepLines: true } },
      heading3: { run: { font: FONT, size: 23, bold: true, color: C.green }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, keepLines: true } },
    },
  },
  numbering: { config: [{ reference: 'todo', levels: checkLevel('□') }, { reference: 'done', levels: checkLevel('■') }] },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE.w, height: PAGE.h },
        margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin, header: 567, footer: 567 },
      },
    },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [tr(data.title, { size: 16, color: C.gray })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: C.gray })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outDocx, buf);
  if (outNotes) fs.writeFileSync(outNotes, JSON.stringify(notes, null, 1), 'utf8');
  const total = stats.reduce((a, s) => a + s.chars, 0);
  console.log(JSON.stringify({ outDocx, slides: notes.length, stats, totalChars: total, minutesAt300: +(total / 300).toFixed(1) }, null, 1));
});
