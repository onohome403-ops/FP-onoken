from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
import datetime
wb=Workbook(); ws=wb.active; ws.title="台帳"
F="Noto Sans JP"
navy="1D2F5E"; gold="B0882C"
def fill(c): return PatternFill("solid",start_color=c,end_color=c)
thin=Side(style="thin",color="DDE2EC")
FIRST,LAST=6,105
ws["A1"]="25周年記念大会 協賛台帳"; ws["A1"].font=Font(name=F,size=15,bold=True,color=navy)
ws["D1"]="声かけ前に、必ずA列を検索（スマホは︙→検索、PCはCtrl+F）。I列に「⚠重複」が出たら担当者に確認。"
ws["D1"].font=Font(name=F,size=10,color="5D6782")
labels=["打診中","承諾","保留","お断り","承諾額 合計（円）","うち入金済（円）"]
rng=lambda col:f"{col}{FIRST}:{col}{LAST}"
forms=[f'=COUNTIF({rng("C")},"打診中")',f'=COUNTIF({rng("C")},"承諾")',f'=COUNTIF({rng("C")},"保留")',f'=COUNTIF({rng("C")},"お断り")',
 f'=SUMIFS({rng("E")},{rng("C")},"承諾")',f'=SUMIFS({rng("E")},{rng("C")},"承諾",{rng("F")},"済")']
for i,(l,f) in enumerate(zip(labels,forms)):
    c=ws.cell(row=2,column=i+1,value=l); c.font=Font(name=F,size=9,bold=True,color="5D6782"); c.fill=fill("F6EEDB"); c.alignment=Alignment(horizontal="center")
    v=ws.cell(row=3,column=i+1,value=f); v.font=Font(name=F,size=14,bold=True,color=navy); v.fill=fill("F6EEDB"); v.alignment=Alignment(horizontal="center")
    v.number_format="#,##0" if i>=4 else '0"件"'
ws["A4"]="6行目は記入例なので、使い始めたら行ごと削除してください。"
ws["A4"].font=Font(name=F,size=9,italic=True,color="5D6782")
heads=["協賛先名","区分","状況","声かけ担当（保護者）","協賛額（円）","入金","最終更新日","メモ（経緯・広告内容・次の予定）","重複チェック","照合用（自動）"]
widths=[24,14,10,20,12,7,12,40,11,18]
for i,(h,w) in enumerate(zip(heads,widths)):
    c=ws.cell(row=5,column=i+1,value=h); c.font=Font(name=F,size=10,bold=True,color="FFFFFF"); c.fill=fill(navy)
    c.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
    ws.column_dimensions[c.column_letter].width=w
ws.row_dimensions[5].height=30
inp=fill("EAF3FB")
for r in range(FIRST,LAST+1):
    for col in range(1,9):
        pass
    ws.cell(row=r,column=5).number_format="#,##0"
    ws.cell(row=r,column=7).number_format="m/d"
    ws.cell(row=r,column=10,value=f'=IF(A{r}="","",LOWER(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(ASC(A{r})," ",""),"株式会社",""),"有限会社",""),"(株)",""),"(有)",""),"・","")))')
    ws.cell(row=r,column=9,value=f'=IF(J{r}="","",IF(COUNTIF($J${FIRST}:$J${LAST},J{r})>1,"⚠重複",""))')

ex=["（記入例）〇〇整骨院","医療・福祉","承諾","〇〇（5年 △△の母）",10000,"済",datetime.date(2026,11,6),"11/2訪問→承諾。パンフに1/4ページ広告希望、原稿は11月末までにもらう"]
for i,v in enumerate(ex):
    c=ws.cell(row=FIRST,column=i+1,value=v); c.font=Font(name=F,size=10,italic=True,color="6B7280")
dv=lambda opts:DataValidation(type="list",formula1='"'+",".join(opts)+'"',allow_blank=True)
for opts,col in ((["企業・事業所","商店・飲食店","医療・福祉","OB・OG","保護者・個人","その他"],"B"),(["未着手","打診中","承諾","保留","お断り"],"C"),(["未","済"],"F")):
    d=dv(opts); ws.add_data_validation(d); d.add(rng(col))
d=DataValidation(type="whole",operator="greaterThanOrEqual",formula1="0",allow_blank=True); ws.add_data_validation(d); d.add(rng("E"))
d=DataValidation(type="date",operator="greaterThan",formula1="44927",allow_blank=True); ws.add_data_validation(d); d.add(rng("G"))
area=f"A{FIRST}:H{LAST}"
for s,bg,fg in (("承諾","E3F3EA","1F7A4D"),("お断り","F9E6E4","A8322D"),("打診中","FDF1D6","9A6A00"),("保留","E9EAF7","5A5F9E")):
    ws.conditional_formatting.add(area,FormulaRule(formula=[f'$C{FIRST}="{s}"'],fill=fill(bg)))
    ws.conditional_formatting.add(rng("C"),FormulaRule(formula=[f'$C{FIRST}="{s}"'],font=Font(bold=True,color=fg),fill=fill(bg)))
ws.conditional_formatting.add(rng("A"),FormulaRule(formula=[f'$I{FIRST}="⚠重複"'],fill=fill("F4C7C3"),font=Font(bold=True,color="A8322D")))
ws.freeze_panes="B6"
ws.auto_filter.ref=f"A5:J{LAST}"
ws.column_dimensions["J"].hidden=True
# usage tab
u=wb.create_sheet("使い方")
rows=["親の会 協賛集めのルール","",
"1. 声をかける前に、「台帳」タブのA列（協賛先名）を検索する",
"2. 載っていなければ、声をかける前に1行追加し、状況を「打診中」にする（これで他の人とかぶらない）",
"3. 返事が来たら「承諾」「保留」「お断り」に更新し、最終更新日を入れる",
"4. お断りも消さずに残す（来年以降の声かけ防止になります）",
"5. 承諾の場合は協賛額を入れ、入金を受けたら「入金」を「済」にする",
"6. 行の削除は、重複登録を消すときだけにする",
"",
"見方のポイント",
"・I列に「⚠重複」が出たら、同じ先がすでに登録されています。先に登録した担当者に確認してください",
"・「(株)」「株式会社」や全角・半角の違いは同じ名前として照合します（ひらがなとカタカナの違いは照合しません）",
"・上の集計欄（打診中・承諾などの件数、承諾額の合計）は自動で計算されます",
"・行の色：緑＝承諾、黄＝打診中、紫＝保留、赤＝お断り",
"・状況で絞り込みたいときは、見出し行のフィルタを使ってください",
"",
"注意",
"・このファイルはリンクを知っている人なら誰でも編集できます。URLはグループLINEの外に出さないでください",
"・協賛先のご担当者の個人の連絡先は書かないでください（必要なら担当の保護者が直接管理）",
"・間違えて消したときは、メニューの「ファイル → 変更履歴」から元に戻せます"]
for i,t in enumerate(rows,1):
    c=u.cell(row=i,column=1,value=t); c.font=Font(name=F,size=10,bold=(i in (1,10,17)),color=navy if i in (1,10,17) else "18213A")
    if i==1: c.font=Font(name=F,size=14,bold=True,color=navy)
u.column_dimensions["A"].width=110
wb.save("協賛台帳.xlsx")
