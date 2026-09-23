#!/usr/bin/env python3
"""
parse_annotations.py — LIDC-IDRI radyolog nodul isaretlemelerini (XML) ayristirir.

Kaynak paket (depoya GIRMEZ, yalnizca yerel/gecici bir klasore indirilir):
  https://www.cancerimagingarchive.net/wp-content/uploads/LIDC-XML-only.zip  (~9 MB)
  Aciliminda iki farkli XML koku var:
    - {http://www.nih.gov}LidcReadMessage      -> BT okuma/isaretleme (KULLANILAN)
    - {http://www.nih.gov/idri}IdriReadMessage -> akciger grafisi okumasi (YOK SAYILIR)

Her LidcReadMessage dosyasi bir seriye ait 1..N `readingSession` (bagimsiz radyolog
okumasi) icerir. Her `readingSession` icinde:
  - unblindedReadNodule  (>=3 mm nodul): characteristics (1-5 olcekli 9 alan) + roi[]
      roi = { imageZposition (mm, hasta koordinati), imageSOP_UID, inclusion, edgeMap[] }
      edgeMap = 512x512 piksel koordinatinda kontur noktasi (poligon)
  - nonNodule (<3 mm isaret, tek nokta) -> bu turda KULLANILMIYOR (brifte belirtildigi gibi)

Bu modul:
  1) Belirli bir SeriesInstanceUID icin ilgili LidcReadMessage dosyasini bulur.
  2) Tum readingSession'lardaki unblindedReadNodule'lari, ROI'lerinin 3B (x_mm, y_mm, z_mm)
     merkezine gore kumeler (union-find, esik: <5mm merkezler arasi mesafe).
  3) Her kume icin readerCount (kac bagimsiz radyolog isaretlemis) hesaplar.
  4) En guclu kumeyi (en yuksek readerCount, esitlikte en cok ROI'li/temsili okuma)
     "birincil nodul" olarak secer ve o nodulun HER bir ROI kesitini (o kesitteki poligon,
     merkez, sinirlayici kutu; 0-1 normalize) doner — boylece prepare_ct.py bu kesitleri
     kare setine zorla ekleyebilir (seyreltmeyi nodul cevresinde sıklastirma).

Kullanim (CLI, tanisal amacli):
  python3 parse_annotations.py --xml-dir <acilmis LIDC-XML-only klasoru> --series-uid <UID> \
      [--pixel-spacing 0.7 0.7] [--json]
"""
from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"nih": "http://www.nih.gov"}
LIDC_ROOT_TAG = "{http://www.nih.gov}LidcReadMessage"

CHARACTERISTIC_SCALE_NOTES = {
    "subtlety": "1=çok belirsiz (ipuçlarıyla farkedilir) … 5=belirgin (kolayca farkedilir)",
    "internalStructure": "1=yumuşak doku, 2=yağ, 3=sıvı, 4=hava, 5=süt/kalsifik yoğunluk (nadiren 2-5 kullanılır)",
    "calcification": "1=patlamış mısır tarzı, 2=laminer, 3=santral, 4=solid, 5=eksantrik, 6=kalsifikasyon yok",
    "sphericity": "1=lineer/düzensiz … 5=yuvarlak (küresel)",
    "margin": "1=zayıf tanımlı … 5=keskin/iyi sınırlı",
    "lobulation": "1=lobülasyon yok … 5=belirgin lobülasyon",
    "spiculation": "1=spikülasyon yok … 5=belirgin spikülasyon",
    "texture": "1=tam ground-glass (non-solid) … 5=tam solid",
    "malignancy": "1=çok düşük olasılık … 5=çok yüksek olasılık (radyoloğun ÖZNEL izlenimi; patoloji doğrulaması YOK)",
}


def find_series_xml(xml_root: Path, series_uid: str) -> Path | None:
    for p in xml_root.rglob("*.xml"):
        try:
            root = ET.parse(p).getroot()
        except ET.ParseError:
            continue
        if root.tag != LIDC_ROOT_TAG:
            continue
        su = root.find(".//nih:ResponseHeader/nih:SeriesInstanceUid", NS)
        if su is not None and su.text and su.text.strip() == series_uid:
            return p
    return None


def _parse_characteristics(ch_el) -> dict:
    out = {}
    if ch_el is None:
        return out
    for child in ch_el:
        key = child.tag.split("}")[-1]
        try:
            out[key] = int(child.text.strip())
        except Exception:
            pass
    return out


def parse_sessions(xml_path: Path):
    """Returns list of {radiologist, nodules:[{noduleID, characteristics, rois:[{z,sop,points:[(x,y)]}]}]}"""
    root = ET.parse(xml_path).getroot()
    sessions = []
    for rs in root.findall("nih:readingSession", NS):
        rad_el = rs.find("nih:servicingRadiologistID", NS)
        rad_id = rad_el.text.strip() if rad_el is not None and rad_el.text else "?"
        nodules = []
        for nod in rs.findall("nih:unblindedReadNodule", NS):
            nid_el = nod.find("nih:noduleID", NS)
            nid = nid_el.text.strip() if nid_el is not None and nid_el.text else "?"
            chars = _parse_characteristics(nod.find("nih:characteristics", NS))
            rois = []
            for roi in nod.findall("nih:roi", NS):
                z_el = roi.find("nih:imageZposition", NS)
                sop_el = roi.find("nih:imageSOP_UID", NS)
                incl_el = roi.find("nih:inclusion", NS)
                pts = []
                for em in roi.findall("nih:edgeMap", NS):
                    x_el = em.find("nih:xCoord", NS)
                    y_el = em.find("nih:yCoord", NS)
                    if x_el is not None and y_el is not None:
                        try:
                            pts.append((float(x_el.text), float(y_el.text)))
                        except Exception:
                            pass
                if not pts:
                    continue
                rois.append({
                    "z": float(z_el.text) if z_el is not None and z_el.text else None,
                    "sop": sop_el.text.strip() if sop_el is not None and sop_el.text else None,
                    "inclusion": (incl_el.text.strip().upper() == "TRUE") if incl_el is not None and incl_el.text else True,
                    "points": pts,
                })
            if rois:
                nodules.append({"noduleID": nid, "characteristics": chars, "rois": rois})
        if nodules:
            sessions.append({"radiologist": rad_id, "nodules": nodules})
    return sessions


def _roi_centroid_px(roi):
    xs = [p[0] for p in roi["points"]]
    ys = [p[1] for p in roi["points"]]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _nodule_centroid_mm(nodule, spacing_x, spacing_y):
    """3D centroid in mm: average of each ROI's 2D pixel-centroid (converted to mm)
    and its z (already in mm, from imageZposition)."""
    xs, ys, zs = [], [], []
    for roi in nodule["rois"]:
        if roi["z"] is None:
            continue
        cx, cy = _roi_centroid_px(roi)
        xs.append(cx * spacing_x)
        ys.append(cy * spacing_y)
        zs.append(roi["z"])
    if not xs:
        return None
    return (sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs))


def cluster_nodules(sessions, spacing_x: float, spacing_y: float, distance_mm: float = 5.0):
    """Union-find clustering of unblindedReadNodule entries across readingSessions,
    by 3D centroid distance < distance_mm. Nodules from the SAME session are never
    merged into the same cluster (a single reader doesn't mark the same nodule twice
    as two separate findings in practice, and this avoids collapsing distinct nearby
    nodules read by one radiologist)."""
    items = []  # (session_idx, nodule_idx, centroid_mm)
    for si, sess in enumerate(sessions):
        for ni, nod in enumerate(sess["nodules"]):
            c = _nodule_centroid_mm(nod, spacing_x, spacing_y)
            if c is None:
                continue
            items.append({"session": si, "nodule_idx": ni, "centroid": c, "nodule": nod, "radiologist": sess["radiologist"]})

    n = len(items)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            if items[i]["session"] == items[j]["session"]:
                continue
            xi, yi, zi = items[i]["centroid"]
            xj, yj, zj = items[j]["centroid"]
            dist = ((xi - xj) ** 2 + (yi - yj) ** 2 + (zi - zj) ** 2) ** 0.5
            if dist < distance_mm:
                union(i, j)

    clusters = {}
    for i in range(n):
        r = find(i)
        clusters.setdefault(r, []).append(items[i])

    result = []
    for members in clusters.values():
        sessions_in_cluster = sorted(set(m["session"] for m in members))
        # representative: the member with the most ROI slices (most fully contoured)
        rep = max(members, key=lambda m: len(m["nodule"]["rois"]))
        avg = lambda key: (
            sum(m["nodule"]["characteristics"].get(key, 0) for m in members if key in m["nodule"]["characteristics"])
            / max(1, sum(1 for m in members if key in m["nodule"]["characteristics"]))
        )
        result.append({
            "readerCount": len(sessions_in_cluster),
            "readerIds": [members[[mm["session"] for mm in members].index(s)]["radiologist"] for s in sessions_in_cluster],
            "members": members,
            "representative": rep,
            "avgCharacteristics": {k: round(avg(k), 2) for k in CHARACTERISTIC_SCALE_NOTES if any(k in m["nodule"]["characteristics"] for m in members)},
        })
    result.sort(key=lambda c: -c["readerCount"])
    return result


def polygon_normalized(points, columns, rows):
    return [[round(x / columns, 4), round(y / rows, 4)] for x, y in points]


def bbox_and_centroid(norm_points):
    xs = [p[0] for p in norm_points]
    ys = [p[1] for p in norm_points]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    centroid = [round(sum(xs) / len(xs), 4), round(sum(ys) / len(ys), 4)]
    bbox = {"x": round(x0, 4), "y": round(y0, 4), "w": round(x1 - x0, 4), "h": round(y1 - y0, 4)}
    return centroid, bbox


def build_frame_annotations(cluster, columns: int, rows: int, finding: str = "nodule_mass"):
    """Given ONE cluster (as returned by cluster_nodules), produce a list of
    per-slice annotation dicts (without frameIndex yet — that is resolved by the
    caller once the final sampled-frame order is known) plus the set of SOP UIDs
    that must be force-included in the rendered frame stack."""
    rep_nodule = cluster["representative"]["nodule"]
    reader_count = cluster["readerCount"]
    reader_ids = cluster["readerIds"]
    characteristics = {
        k: v for k, v in rep_nodule["characteristics"].items() if k in CHARACTERISTIC_SCALE_NOTES
    }
    records = []
    sop_uids = []
    for roi in rep_nodule["rois"]:
        if not roi["inclusion"] or roi["sop"] is None:
            continue
        norm = polygon_normalized(roi["points"], columns, rows)
        centroid, bbox = bbox_and_centroid(norm)
        records.append({
            "finding": finding,
            "sopUID": roi["sop"],
            "window": "lung",
            "polygon": norm,
            "centroid": centroid,
            "bbox": bbox,
            "readerCount": reader_count,
            "readerIds": reader_ids,
            "characteristics": characteristics,
            "source": "expert_bbox",
        })
        sop_uids.append(roi["sop"])
    return records, sop_uids


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--xml-dir", type=Path, required=True, help="acilmis LIDC-XML-only klasoru")
    ap.add_argument("--series-uid", type=str, required=True)
    ap.add_argument("--pixel-spacing", type=float, nargs=2, default=[0.7, 0.7], metavar=("SX", "SY"))
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    xml_path = find_series_xml(args.xml_dir, args.series_uid)
    if xml_path is None:
        print("Bu seri icin LidcReadMessage bulunamadi.", file=sys.stderr)
        sys.exit(1)
    sessions = parse_sessions(xml_path)
    clusters = cluster_nodules(sessions, args.pixel_spacing[0], args.pixel_spacing[1])
    if args.json:
        def ser(c):
            return {
                "readerCount": c["readerCount"],
                "readerIds": c["readerIds"],
                "avgCharacteristics": c["avgCharacteristics"],
                "nRoisRepresentative": len(c["representative"]["nodule"]["rois"]),
            }
        print(json.dumps([ser(c) for c in clusters], indent=2, ensure_ascii=False))
    else:
        print(f"xml={xml_path}")
        for c in clusters:
            print(f"readerCount={c['readerCount']} readerIds={c['readerIds']} avgChar={c['avgCharacteristics']}")


if __name__ == "__main__":
    main()
