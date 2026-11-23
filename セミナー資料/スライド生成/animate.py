"""pptxgenjs で作ったデッキに、スライド切り替え（フェード）と入場アニメーションを追加する。
usage: python animate.py deck.pptx deck.pptx.anim.json out.pptx
"""
import json, re, sys, zipfile, shutil

src, spec_path, out = sys.argv[1:4]
spec = json.load(open(spec_path, encoding="utf-8"))
DUR = {"fade": 500, "wipe": 600, "zoom": 500}


class Ids:
    def __init__(self):
        self.n = 2  # 1: root, 2: main seq

    def next(self):
        self.n += 1
        return self.n


def tgt(spid):
    return f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'


def effect_xml(ids, spid, effect, node_type):
    d = DUR[effect]
    if effect == "fade":
        pid, sub = 10, 0
        body = f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{ids.next()}" dur="{d}"/>{tgt(spid)}</p:cBhvr></p:animEffect>'
    elif effect == "wipe":
        pid, sub = 22, 8
        body = f'<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="{ids.next()}" dur="{d}"/>{tgt(spid)}</p:cBhvr></p:animEffect>'
    else:  # zoom
        pid, sub = 53, 16
        body = ""
        for attr, var in (("ppt_w", "#ppt_w"), ("ppt_h", "#ppt_h")):
            body += (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{ids.next()}" dur="{d}" fill="hold"/>{tgt(spid)}'
                     f'<p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr>'
                     f'<p:tavLst><p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav>'
                     f'<p:tav tm="100000"><p:val><p:strVal val="{var}"/></p:val></p:tav></p:tavLst></p:anim>')
        body += f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{ids.next()}" dur="{d}"/>{tgt(spid)}</p:cBhvr></p:animEffect>'
    outer = ids.next()
    setid = ids.next()
    s = (f'<p:par><p:cTn id="{outer}" presetID="{pid}" presetClass="entr" presetSubtype="{sub}" fill="hold" grpId="0" nodeType="{node_type}">'
         f'<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
         f'<p:set><p:cBhvr><p:cTn id="{setid}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>{tgt(spid)}'
         f'<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>'
         f'{body}</p:childTnLst></p:cTn></p:par>')
    return s, d


def build_timing(steps, name_to_id):
    # group steps: a new group starts at each click
    groups = []
    for st in steps:
        if st["type"] == "click" or not groups:
            groups.append({"auto": st["type"] != "click", "inner": []})
        g = groups[-1]
        if st["type"] in ("click", "after") or not g["inner"]:
            g["inner"].append([])
        g["inner"][-1].append(st)
    ids = Ids()
    xml_groups = []
    for g in groups:
        gid = ids.next()
        inner_xml, delay = [], 0
        for k, par in enumerate(g["inner"]):
            pid = ids.next()
            effs, maxd = [], 0
            for j, st in enumerate(par):
                for m, name in enumerate(st["names"]):
                    first = (j == 0 and m == 0)
                    if not first:
                        nt = "withEffect"
                    elif st["type"] == "click":
                        nt = "clickEffect"
                    elif st["type"] == "after":
                        nt = "afterEffect"
                    else:
                        nt = "withEffect"
                    x, d = effect_xml(ids, name_to_id[name], st["effect"], nt)
                    effs.append(x)
                    maxd = max(maxd, d)
            inner_xml.append(f'<p:par><p:cTn id="{pid}" fill="hold"><p:stCondLst><p:cond delay="{delay}"/></p:stCondLst>'
                             f'<p:childTnLst>{"".join(effs)}</p:childTnLst></p:cTn></p:par>')
            delay += maxd
        cond = '<p:cond delay="indefinite"/>'
        if g["auto"]:
            cond += '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>'
        xml_groups.append(f'<p:par><p:cTn id="{gid}" fill="hold"><p:stCondLst>{cond}</p:stCondLst>'
                          f'<p:childTnLst>{"".join(inner_xml)}</p:childTnLst></p:cTn></p:par>')
    return ('<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            + "".join(xml_groups) +
            '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            '</p:childTnLst></p:cTn></p:par></p:tnLst>')


TRANSITION = '<p:transition spd="med"><p:fade/></p:transition>'

zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(out + ".tmp", "w", zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    m = re.fullmatch(r"ppt/slides/slide(\d+)\.xml", item.filename)
    if m:
        no = m.group(1)
        xml = data.decode("utf-8")
        # name -> id, and which ids are p:sp
        name_to_id, sp_ids = {}, set()
        for kind, body in re.findall(r"<p:(sp|pic|graphicFrame|cxnSp)>(.*?)</p:\1>", xml, flags=re.S):
            mm = re.search(r'<p:cNvPr id="(\d+)" name="([^"]*)"', body)
            if mm:
                name_to_id[mm.group(2)] = mm.group(1)
                if kind == "sp":
                    sp_ids.add(mm.group(1))
        steps = spec.get(no, [])
        missing = [n for st in steps for n in st["names"] if n not in name_to_id]
        if missing:
            sys.exit(f"slide {no}: names not found {missing}")
        extra = TRANSITION
        if steps:
            timing = build_timing(steps, name_to_id)
            used = []
            for st in steps:
                for n in st["names"]:
                    i = name_to_id[n]
                    if i in sp_ids and i not in used:
                        used.append(i)
            bld = "".join(f'<p:bldP spid="{i}" grpId="0" animBg="1"/>' for i in used)
            timing += (f"<p:bldLst>{bld}</p:bldLst>" if bld else "") + "</p:timing>"
            extra += timing
        xml = re.sub(r"<p:transition.*?</p:transition>|<p:transition[^>]*/>", "", xml, flags=re.S)
        if "</p:clrMapOvr>" in xml:
            xml = xml.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + extra, 1)
        else:
            xml = xml.replace("</p:cSld>", "</p:cSld>" + extra, 1)
        data = xml.encode("utf-8")
    zout.writestr(item, data)
zout.close()
shutil.move(out + ".tmp", out)
print("animated", out)
