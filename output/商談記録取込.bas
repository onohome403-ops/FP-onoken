Attribute VB_Name = "ModShodanImport"
Option Explicit
'==========================================================
' 商談記録 → 人脈リスト／接触履歴 自動入力
'   商談記録_読み取り : B5以下のメモを解析し、右の確認欄(E列)に展開
'   商談記録_登録     : 確認欄の内容を人脈リスト・接触履歴へ反映
'   商談記録_クリア   : 貼り付け欄と確認欄を空にする
'   初期設定_ボタン配置 : 商談記録シートにボタンを作成（初回のみ）
'==========================================================
Private Const SH_IN As String = "商談記録"
Private Const SH_LIST As String = "人脈リスト"
Private Const SH_LOG As String = "接触履歴"
Private Const HDR_ROW As Long = 4
Private Const DATA_FIRST As Long = 5
Private Const DATA_LAST As Long = 504
Private Const PASTE_RANGE As String = "B5:B60"
Private Const F_LBL As Long = 4   'D列：項目名
Private Const F_VAL As Long = 5   'E列：値
Private Const F_FIRST As Long = 5
Private Const F_LAST As Long = 29
Private Const L_ID As String = "ID（既存の人を指定する場合）"

'---------------- 読み取り ----------------
Public Sub 商談記録_読み取り()
    Dim ws As Worksheet, c As Range, txt As String
    Dim lines As Variant, i As Long, t As String, tag As String, v As String
    Dim p As Long, r As Long, cur As Long

    Set ws = ThisWorkbook.Worksheets(SH_IN)
    For Each c In ws.Range(PASTE_RANGE).Cells
        If Len(CStr(c.Value)) > 0 Then txt = txt & CStr(c.Value) & vbLf
    Next c
    If Len(Trim$(txt)) = 0 Then
        MsgBox "B5以下に商談メモを貼り付けてください。", vbExclamation
        Exit Sub
    End If

    ws.Range(ws.Cells(F_FIRST, F_VAL), ws.Cells(F_LAST, F_VAL)).ClearContents
    txt = Replace(txt, vbCrLf, vbLf)
    txt = Replace(txt, vbCr, vbLf)
    lines = Split(txt, vbLf)
    cur = 0

    For i = LBound(lines) To UBound(lines)
        t = CleanLine(CStr(lines(i)))
        If Len(t) = 0 Then GoTo NextLine
        tag = "": v = ""
        If Left$(t, 1) = "【" Then
            p = InStr(t, "】")
            If p > 2 Then
                tag = Mid$(t, 2, p - 2)
                v = Mid$(t, p + 1)
            End If
        Else
            p = FirstColon(t)
            If p > 1 And p <= 16 Then
                tag = Left$(t, p - 1)
                v = Mid$(t, p + 1)
            End If
        End If
        If Len(tag) > 0 Then
            r = FindFormRow(tag)
            If r > 0 Then
                cur = r
                AppendVal ws.Cells(r, F_VAL), CleanLine(v)
                GoTo NextLine
            End If
        End If
        '見出しのない行は直前の項目の続きとして扱う
        If cur = 0 Then cur = FindFormRow("内容")
        AppendVal ws.Cells(cur, F_VAL), t
NextLine:
    Next i

    r = FindFormRow("日付")
    If Len(CStr(ws.Cells(r, F_VAL).Value)) = 0 Then ws.Cells(r, F_VAL).Value = Format(Date, "yyyy/mm/dd")
    r = FindFormRow("手段")
    If Len(CStr(ws.Cells(r, F_VAL).Value)) = 0 Then ws.Cells(r, F_VAL).Value = "面談"

    ws.Activate
    ws.Cells(FindFormRow("氏名"), F_VAL).Select
    MsgBox "読み取りました。右側（E列）の内容を確認・修正してから「② 登録」を押してください。", vbInformation
End Sub

'---------------- 登録 ----------------
Public Sub 商談記録_登録()
    Dim wsI As Worksheet, wsL As Worksheet, wsH As Worksheet
    Dim nm As String, idv As String, dtv As Date
    Dim cID As Long, cNm As Long, cMemo As Long, rowP As Long, isNew As Boolean
    Dim r As Long, lbl As String, v As String, c As Long, cell As Range
    Dim entry As String, ref As Long, h As Long, pid As Variant, sh As String

    Set wsI = ThisWorkbook.Worksheets(SH_IN)
    Set wsL = ThisWorkbook.Worksheets(SH_LIST)
    Set wsH = ThisWorkbook.Worksheets(SH_LOG)

    nm = GetF("氏名")
    idv = StrConv(GetF(L_ID), vbNarrow)
    If nm = "" And idv = "" Then
        MsgBox "「氏名」または「ID」を入力してください。", vbExclamation
        Exit Sub
    End If
    dtv = Date
    If IsDate(GetF("日付")) Then dtv = CDate(GetF("日付"))

    cID = HdrCol(wsL, "ID")
    cNm = HdrCol(wsL, "氏名")
    cMemo = HdrCol(wsL, "メモ")
    If cID = 0 Or cNm = 0 Then
        MsgBox "人脈リストの見出し（ID／氏名）が見つかりません。", vbCritical
        Exit Sub
    End If

    '--- 対象者の特定 ---
    If idv <> "" Then
        If Not IsNumeric(idv) Then
            MsgBox "IDは数字で入力してください。", vbExclamation
            Exit Sub
        End If
        rowP = FindRowByID(wsL, cID, CLng(idv))
        If rowP = 0 Then
            MsgBox "ID " & idv & " が人脈リストに見つかりません。", vbExclamation
            Exit Sub
        End If
    Else
        rowP = FindRowByName(wsL, cNm, cID, nm)
        If rowP = -1 Then Exit Sub
        If rowP = 0 Then
            If MsgBox("「" & nm & "」さんは未登録です。新規登録しますか？", vbOKCancel + vbQuestion) <> vbOK Then Exit Sub
            rowP = FirstEmptyRow(wsL, cNm)
            If rowP = 0 Then
                MsgBox "人脈リストに空き行がありません。", vbCritical
                Exit Sub
            End If
            isNew = True
            wsL.Cells(rowP, cNm).Value = nm
        End If
    End If

    '--- 人脈リストへ反映 ---
    For r = F_FIRST To F_LAST
        lbl = CStr(wsI.Cells(r, F_LBL).Value)
        v = Trim$(CStr(wsI.Cells(r, F_VAL).Value))
        If v = "" Or lbl = "氏名" Or lbl = L_ID Then GoTo NextR
        c = HdrCol(wsL, lbl)
        If c = 0 Then GoTo NextR
        Set cell = wsL.Cells(rowP, c)
        If cell.HasFormula Then GoTo NextR

        Select Case lbl
            Case "家族・ライフイベント", "関心事・ニーズ", "強み・つなげられる先", "メモ"
                '上書きせず日付付きで追記（同じ内容は追記しない）
                If InStr(CStr(cell.Value), v) = 0 Then
                    entry = "[" & Format(dtv, "yyyy/mm/dd") & "] " & v
                    If CStr(cell.Value) = "" Then
                        cell.Value = entry
                    Else
                        cell.Value = CStr(cell.Value) & vbLf & entry
                    End If
                End If
            Case "誕生日", "次回予定日"
                If IsDate(v) Then cell.Value = CDate(v) Else cell.Value = v
            Case "紹介者（ID）"
                ref = ResolveID(wsL, cNm, cID, v)
                If ref > 0 Then
                    cell.Value = ref
                ElseIf cMemo > 0 Then
                    entry = "[" & Format(dtv, "yyyy/mm/dd") & "] 紹介者：" & v & "（未登録）"
                    If CStr(wsL.Cells(rowP, cMemo).Value) = "" Then
                        wsL.Cells(rowP, cMemo).Value = entry
                    Else
                        wsL.Cells(rowP, cMemo).Value = CStr(wsL.Cells(rowP, cMemo).Value) & vbLf & entry
                    End If
                End If
            Case "重要度"
                cell.Value = UCase$(StrConv(v, vbNarrow))
            Case Else
                cell.Value = v
        End Select
NextR:
    Next r

    Application.Calculate
    pid = wsL.Cells(rowP, cID).Value

    '--- 接触履歴へ追加 ---
    h = wsH.Cells(wsH.Rows.Count, 1).End(xlUp).Row + 1
    If h < 2 Then h = 2
    sh = GetF("手段")
    If sh = "" Then sh = "面談"
    wsH.Cells(h, 1).Value = dtv
    wsH.Cells(h, 2).Value = pid
    wsH.Cells(h, 4).Value = sh
    wsH.Cells(h, 5).Value = GetF("内容・話したこと")
    wsH.Cells(h, 6).Value = GetF("相手の変化・新情報")
    wsH.Cells(h, 7).Value = GetF("次回アクション")
    Application.Calculate

    MsgBox IIf(isNew, "新規登録", "更新") & "しました。" & vbLf & vbLf & _
           "氏名：" & wsL.Cells(rowP, cNm).Value & "（ID " & pid & "）" & vbLf & _
           "接触履歴：" & h & "行目に追加", vbInformation
    If MsgBox("入力欄をクリアしますか？", vbYesNo + vbQuestion) = vbYes Then 商談記録_クリア
End Sub

'---------------- クリア ----------------
Public Sub 商談記録_クリア()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SH_IN)
    ws.Range(PASTE_RANGE).ClearContents
    ws.Range(ws.Cells(F_FIRST, F_VAL), ws.Cells(F_LAST, F_VAL)).ClearContents
    ws.Range("B5").Select
End Sub

'---------------- ボタン配置（初回のみ） ----------------
Public Sub 初期設定_ボタン配置()
    Dim ws As Worksheet, rg As Range
    Set ws = ThisWorkbook.Worksheets(SH_IN)
    On Error Resume Next
    ws.Buttons.Delete
    On Error GoTo 0
    Set rg = ws.Range("B3")
    AddBtn ws, rg.Left, rg.Top + 2, 120, rg.Height - 4, "① 読み取り", "商談記録_読み取り"
    AddBtn ws, rg.Left + 130, rg.Top + 2, 120, rg.Height - 4, "② 登録", "商談記録_登録"
    AddBtn ws, rg.Left + 260, rg.Top + 2, 80, rg.Height - 4, "クリア", "商談記録_クリア"
    MsgBox "ボタンを配置しました。", vbInformation
End Sub

Private Sub AddBtn(ws As Worksheet, l As Double, t As Double, w As Double, h As Double, cap As String, mac As String)
    Dim b As Object
    Set b = ws.Buttons.Add(l, t, w, h)
    b.Caption = cap
    b.OnAction = mac
End Sub

'================ 以下 補助関数 ================
Private Function GetF(ByVal lbl As String) As String
    Dim ws As Worksheet, r As Long
    Set ws = ThisWorkbook.Worksheets(SH_IN)
    For r = F_FIRST To F_LAST
        If CStr(ws.Cells(r, F_LBL).Value) = lbl Then
            GetF = Trim$(CStr(ws.Cells(r, F_VAL).Value))
            Exit Function
        End If
    Next r
End Function

Private Sub AppendVal(c As Range, ByVal v As String)
    If Len(v) = 0 Then Exit Sub
    If Len(CStr(c.Value)) = 0 Then
        c.Value = v
    Else
        c.Value = CStr(c.Value) & vbLf & v
    End If
End Sub

Private Function CleanLine(ByVal s As String) As String
    Dim changed As Boolean, ch As Variant
    s = Replace(s, vbTab, " ")
    Do
        changed = False
        s = Trim$(s)
        Do While Left$(s, 1) = "　"
            s = Mid$(s, 2)
            changed = True
        Loop
        For Each ch In Array("・", "■", "□", "●", "○", "◆", "◇", "＊", "*", "- ", "－")
            If Len(s) >= Len(ch) Then
                If Left$(s, Len(ch)) = ch Then
                    s = Mid$(s, Len(ch) + 1)
                    changed = True
                End If
            End If
        Next ch
    Loop While changed
    CleanLine = s
End Function

Private Function FirstColon(ByVal s As String) As Long
    Dim a As Long, b As Long
    a = InStr(s, "：")
    b = InStr(s, ":")
    If a = 0 Then
        FirstColon = b
    ElseIf b = 0 Then
        FirstColon = a
    Else
        FirstColon = IIf(a < b, a, b)
    End If
End Function

Private Function Norm(ByVal s As String) As String
    Dim ch As Variant
    s = LCase$(StrConv(s, vbNarrow))
    For Each ch In Array(" ", "　", "(", ")", "（", "）", "・", "･", "/", "／", ":", "：", "【", "】", "[", "]", "「", "」")
        s = Replace(s, ch, "")
    Next ch
    Norm = s
End Function

Private Function IsAny(ByVal n As String, ParamArray words() As Variant) As Boolean
    Dim w As Variant
    For Each w In words
        If n = Norm(CStr(w)) Then
            IsAny = True
            Exit Function
        End If
    Next w
End Function

'表記ゆれ → 正式な項目名
Private Function AliasOf(ByVal n As String) As String
    If IsAny(n, "日時", "面談日", "接触日", "訪問日") Then AliasOf = "日付": Exit Function
    If IsAny(n, "名前", "お名前", "顧客名", "相手") Then AliasOf = "氏名": Exit Function
    If IsAny(n, "読み", "よみ", "フリガナ") Then AliasOf = "ふりがな": Exit Function
    If IsAny(n, "所属", "会社名", "勤務先", "職場") Then AliasOf = "会社・所属": Exit Function
    If IsAny(n, "役職", "職種", "職業", "仕事") Then AliasOf = "役職・職種": Exit Function
    If IsAny(n, "区分", "関係") Then AliasOf = "関係区分": Exit Function
    If IsAny(n, "温度", "見込み度") Then AliasOf = "温度感": Exit Function
    If IsAny(n, "経緯", "きっかけ", "出会い") Then AliasOf = "出会った経緯": Exit Function
    If IsAny(n, "紹介者", "紹介元", "紹介") Then AliasOf = "紹介者（ID）": Exit Function
    If IsAny(n, "携帯", "tel", "電話番号") Then AliasOf = "電話": Exit Function
    If IsAny(n, "mail", "e-mail", "email") Then AliasOf = "メール": Exit Function
    If IsAny(n, "sns", "line", "instagram", "facebook") Then AliasOf = "LINE/SNS": Exit Function
    If IsAny(n, "家族", "家族構成", "ライフイベント") Then AliasOf = "家族・ライフイベント": Exit Function
    If IsAny(n, "関心", "関心事", "ニーズ", "課題", "悩み") Then AliasOf = "関心事・ニーズ": Exit Function
    If IsAny(n, "強み", "人脈", "つなげられる先") Then AliasOf = "強み・つなげられる先": Exit Function
    If IsAny(n, "内容", "話したこと", "商談内容", "要約", "概要") Then AliasOf = "内容・話したこと": Exit Function
    If IsAny(n, "新情報", "変化", "相手の変化", "新しい情報") Then AliasOf = "相手の変化・新情報": Exit Function
    If IsAny(n, "次アクション", "次のアクション", "宿題", "todo", "対応") Then AliasOf = "次回アクション": Exit Function
    If IsAny(n, "次回", "次回予定", "予定日", "次回日程") Then AliasOf = "次回予定日": Exit Function
    If IsAny(n, "備考", "その他") Then AliasOf = "メモ": Exit Function
End Function

Private Function FindFormRow(ByVal tag As String) As Long
    Dim ws As Worksheet, r As Long, n As String, a As String, lb As String
    Set ws = ThisWorkbook.Worksheets(SH_IN)
    n = Norm(tag)
    If Len(n) = 0 Then Exit Function
    a = AliasOf(n)
    If Len(a) > 0 Then n = Norm(a)
    For r = F_FIRST To F_LAST
        If Norm(CStr(ws.Cells(r, F_LBL).Value)) = n Then FindFormRow = r: Exit Function
    Next r
    If Len(n) >= 2 Then
        For r = F_FIRST To F_LAST
            lb = Norm(CStr(ws.Cells(r, F_LBL).Value))
            If Left$(lb, Len(n)) = n Then FindFormRow = r: Exit Function
        Next r
    End If
End Function

Private Function HdrCol(ws As Worksheet, ByVal nm As String) As Long
    Dim c As Long
    For c = 1 To 80
        If CStr(ws.Cells(HDR_ROW, c).Value) = nm Then HdrCol = c: Exit Function
    Next c
End Function

Private Function NameKey(ByVal s As String) As String
    NameKey = Replace(Replace(StrConv(Trim$(s), vbNarrow), " ", ""), "　", "")
End Function

Private Function FindRowByID(ws As Worksheet, ByVal cID As Long, ByVal id As Long) As Long
    Dim r As Long, v As Variant
    For r = DATA_FIRST To DATA_LAST
        v = ws.Cells(r, cID).Value
        If Not IsError(v) Then
            If IsNumeric(v) And CStr(v) <> "" Then
                If CLng(v) = id Then FindRowByID = r: Exit Function
            End If
        End If
    Next r
End Function

'0=該当なし / -1=キャンセル / それ以外=行番号
Private Function FindRowByName(ws As Worksheet, ByVal cNm As Long, ByVal cID As Long, ByVal nm As String) As Long
    Dim r As Long, cnt As Long, hit As Long, lst As String, key As String, ans As String, cCo As Long
    key = NameKey(nm)
    cCo = HdrCol(ws, "会社・所属")
    For r = DATA_FIRST To DATA_LAST
        If NameKey(CStr(ws.Cells(r, cNm).Value)) = key And key <> "" Then
            cnt = cnt + 1
            hit = r
            lst = lst & "  ID " & ws.Cells(r, cID).Value & "：" & ws.Cells(r, cNm).Value
            If cCo > 0 Then lst = lst & "（" & ws.Cells(r, cCo).Value & "）"
            lst = lst & vbLf
        End If
    Next r
    If cnt <= 1 Then FindRowByName = hit: Exit Function
    ans = InputBox("同じ氏名の人が複数います。対象のIDを入力してください。" & vbLf & vbLf & lst, "対象者の選択")
    If ans = "" Then FindRowByName = -1: Exit Function
    ans = StrConv(ans, vbNarrow)
    If Not IsNumeric(ans) Then FindRowByName = -1: Exit Function
    FindRowByName = FindRowByID(ws, cID, CLng(ans))
    If FindRowByName = 0 Then
        MsgBox "ID " & ans & " が見つかりません。", vbExclamation
        FindRowByName = -1
    End If
End Function

'紹介者：数字ならそのままID、氏名なら一意に特定できればIDへ変換
Private Function ResolveID(ws As Worksheet, ByVal cNm As Long, ByVal cID As Long, ByVal v As String) As Long
    Dim n As String, r As Long, cnt As Long, hit As Long
    n = StrConv(Trim$(v), vbNarrow)
    If IsNumeric(n) Then
        If FindRowByID(ws, cID, CLng(n)) > 0 Then ResolveID = CLng(n)
        Exit Function
    End If
    For r = DATA_FIRST To DATA_LAST
        If NameKey(CStr(ws.Cells(r, cNm).Value)) = NameKey(v) Then
            cnt = cnt + 1
            hit = r
        End If
    Next r
    If cnt = 1 Then ResolveID = CLng(ws.Cells(hit, cID).Value)
End Function

Private Function FirstEmptyRow(ws As Worksheet, ByVal cNm As Long) As Long
    Dim r As Long
    For r = DATA_FIRST To DATA_LAST
        If Trim$(CStr(ws.Cells(r, cNm).Value)) = "" Then FirstEmptyRow = r: Exit Function
    Next r
End Function
