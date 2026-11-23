# my_design.md（わたしのデザインの決まり）

作った日：2026-11-23
直した日：まだなし

## 1. 届けたい人
親の介護が気になり始めた30〜50代の子ども世代。あわせて、ケアマネ・介護職の方にも見てもらう。

## 2. 使う場所と大きさ
- Instagram → 4:5（1080×1350）
- Threads → 正方形（1080×1080）

## 3. 色（3つまで）
- メイン：オレンジ --accent #E8752F／うすい版 --accentbg #FDE8D9
- サブ：なし（矢印などの小さな所は、こげ茶のふつう --accent2 #8B6447 を使う。新しい色は足さない）
- 3つ目：こげ茶 → 文字の色 --ink #5C3F2B
- 背景 --bg #F7F1E8（生成り）／カード --card #FFFFFF／補足の文字 --ink2 #7A604D／線 --line #E8DCCB
- メインの上の文字 --on-accent #FFFFFF（大きく太い数字だけに使う）

## 4. 雰囲気と字
- 雰囲気：やさしい・あたたかい
- 見出しの字：M PLUS Rounded 1c・太さ800／本文の字：Zen Maru Gothic
- 角の丸み：22px／背景のドット：なし（子どもっぽさを避けるため）

## 5. 避けたい印象
派手・子どもっぽい・冷たい・売り込みっぽい・地味・ごちゃごちゃ
→ 組み方：
- 帯（.band）を使わない。オレンジは番号の丸・マーカー・ゴールの枠だけ
- 丸ゴシックの太さは800まで。ドットなし。線画は小さく1つだけ
- 背景は真っ白にせず生成り。角は丸く（22px）
- 「保存版」「限定」などの札を付けない
- マーカーを1か所は入れて、地味にしない
- カードは3つまで。余白を広めにとる

## 6. 顔写真
使わない

## 7. 文字の量
ふつう（大見出し＋カード3つまで）

## 8. 名前の入れ方
- 入れる場所：下に小さく
- 書く文字：おのけん｜宮城の介護とお金の相談室
- 丸の中の1文字：お

## 9. 会社の決まり（スキルの決まりより優先）
- 社名を出さない
- 数字を出すときは上司の確認が要る（数字を入れた画像は「上司の確認が要ります」と必ず伝える）
- 保険商品の話はSNSに出さない

## 10. 決まりの見本（Claude が書く。この :root をそのまま使う）
```css
:root{
  --bg:#F7F1E8; --card:#FFFFFF; --ink:#5C3F2B; --ink2:#7A604D;
  --accent:#E8752F; --accent2:#8B6447; --accentbg:#FDE8D9;
  --line:#E8DCCB; --dot:transparent; --shadow:rgba(92,63,43,.08);
  --on-accent:#FFFFFF;
  --font-hd:"M PLUS Rounded 1c","Zen Maru Gothic","Hiragino Maru Gothic ProN","Yu Gothic","Meiryo",sans-serif;
  --font-body:"Zen Maru Gothic","M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Yu Gothic","Meiryo",sans-serif;
  --hd-weight:800; --radius:22px;
}
```

## 11. 育てた記録（直したことを1行ずつ足していく）
- まだなし
