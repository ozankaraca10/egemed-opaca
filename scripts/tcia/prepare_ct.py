#!/usr/bin/env python3
"""
prepare_ct.py — EGEMED Opaca icin TCIA LIDC-IDRI toraks BT serilerini
DICOM'dan pencerelenmis WebP kesit yigina donusturur.

Girdi : fixtures/tcia-series.json
  [{ "id": "ct_intro_01", "seriesUID": "...", "patientId": "LIDC-IDRI-0001",
     "topic": "ct_intro", "note": "..." }, ...]

Cikti :
  public/assets/ct/<id>/lung/000.webp ...
  public/assets/ct/<id>/mediastinum/000.webp ...
  reports/tcia/<id>.json           (seri basina rapor)
  reports/tcia/manifest.json       (tum secili serilerin toplu sozlesmesi)

Kaynak: TCIA NBIA API (anahtarsiz, herkese acik):
  Seri indirme: https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID=<UID>
  -> DICOM dosyalarinin ZIP'i.

Lisans: LIDC-IDRI veri seti CC BY 3.0 (TCIA). Atif zorunlu; bkz. docs/TCIA-BT.md.

Bagimliliklar: pydicom, numpy, Pillow (bkz. requirements.txt). Bu betik depo
genelindeki Node/npm derlemesine dahil DEGILDIR; tek seferlik veri hazirlama
adimidir.

Kullanim:
  python3 -m venv scripts/tcia/.venv
  scripts/tcia/.venv/bin/pip install -r scripts/tcia/requirements.txt
  scripts/tcia/.venv/bin/python scripts/tcia/prepare_ct.py --limit 1 --dry-run
  scripts/tcia/.venv/bin/python scripts/tcia/prepare_ct.py
"""
from __future__ import annotations

import argparse
import io
import json
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = REPO_ROOT / "fixtures" / "tcia-series.json"
DEFAULT_ASSETS = REPO_ROOT / "public" / "assets" / "ct"
DEFAULT_REPORTS = REPO_ROOT / "reports" / "tcia"

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_annotations  # noqa: E402  (local module, same klasor)

NBIA_GET_IMAGE = "https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID={uid}"

WINDOWS = {
    "lung": {"center": -600, "width": 1500, "label": "Akciğer penceresi (C −600 / W 1500)"},
    "mediastinum": {"center": 50, "width": 350, "label": "Mediasten penceresi (C 50 / W 350)"},
}

LICENSE_INFO = {
    "name": "CC BY 3.0",
    "url": "https://creativecommons.org/licenses/by/3.0/",
    "attribution": (
        "Armato SG III, McLennan G, Bidaut L, McNitt-Gray MF, Meyer CR, Reeves AP, "
        "Zhao B, Aberle DR, Henschke CI, Hoffman EA, Kazerooni EA, MacMahon H, "
        "van Beeke EJT, Yankelevitz D, Biancardi AM, Bland PH, Brown MS, Engelmann RM, "
        "Laderach GE, Max D, Pais RC, Qing DPY, Roberts RY, Smith AR, Starkey A, "
        "Batra P, Caligiuri P, Farooqi A, Gladish GW, Jude CM, Munden RF, Petkovska I, "
        "Quint LE, Schwartz LH, Sundaram B, Dodd LE, Fenimore C, Gur D, Petrick N, "
        "Freymann J, Kirby J, Hughes B, Casteele AV, Gupte S, Sallam M, Heath MD, "
        "Kuhn MH, Dharaiya E, Burns R, Fryd DS, Salganicoff M, Anand V, Shreter U, "
        "Vastagh S, Croft BY. Data From LIDC-IDRI [Data set]. The Cancer Imaging "
        "Archive (2015). https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX — "
        "Clark K, Vendt B, Smith K, Freymann J, Kirby J, Koppel P, Moore S, Phillips "
        "S, Maffitt D, Pringle M, Tarbox L, Prior F. The Cancer Imaging Archive "
        "(TCIA): Maintaining and Operating a Public Information Repository. "
        "Journal of Digital Imaging, 26(6), 1045-1057 (2013). "
        "DOI: 10.1007/s10278-013-9622-7"
    ),
    "sourceUrl": "https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX",
    "datasetId": "tcia-lidc-idri",
}


@dataclass
class SeriesSpec:
    id: str
    seriesUID: str
    patientId: str
    topic: str
    note: str = ""
    extra: dict = field(default_factory=dict)


def load_specs(input_path: Path) -> list[SeriesSpec]:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    specs = []
    for row in data:
        specs.append(
            SeriesSpec(
                id=row["id"],
                seriesUID=row["seriesUID"],
                patientId=row["patientId"],
                topic=row["topic"],
                note=row.get("note", ""),
                extra=row,
            )
        )
    return specs


def download_series_zip(series_uid: str, dest_zip: Path, timeout: int = 120) -> int:
    url = NBIA_GET_IMAGE.format(uid=series_uid)
    req = urllib.request.Request(url, headers={"User-Agent": "egemed-opaca-tcia-prep/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(dest_zip, "wb") as f:
        shutil.copyfileobj(resp, f)
    return dest_zip.stat().st_size


def extract_zip(zip_path: Path, dest_dir: Path) -> list[Path]:
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest_dir)
    return sorted(dest_dir.rglob("*.dcm")) or sorted(
        p for p in dest_dir.rglob("*") if p.is_file()
    )


def load_and_sort_dicoms(paths: list[Path]):
    import pydicom

    ds_list = []
    for p in paths:
        try:
            ds = pydicom.dcmread(str(p))
        except Exception:
            continue
        if not hasattr(ds, "pixel_array"):
            continue
        ds_list.append(ds)

    def sort_key(ds):
        try:
            return int(ds.InstanceNumber)
        except Exception:
            try:
                return float(ds.ImagePositionPatient[2])
            except Exception:
                return 0

    ds_list.sort(key=sort_key)
    return ds_list


def hu_window_to_uint8(hu: "np.ndarray", center: float, width: float) -> "np.ndarray":
    import numpy as np

    lo = center - width / 2.0
    hi = center + width / 2.0
    clipped = np.clip(hu, lo, hi)
    scaled = (clipped - lo) / (hi - lo) * 255.0
    return scaled.astype(np.uint8)


MIN_READER_COUNT_FOR_ANNOTATION = 1  # tum kumeler rapora yazilir; readerCount<3 "yalnizca ogrenme" olarak isaretlenir
CONSENSUS_READER_THRESHOLD = 3  # >=3 okuyucu = degerlendirmeye uygun (brif)


def process_series(
    spec: SeriesSpec,
    assets_root: Path,
    reports_root: Path,
    every: int,
    size: int,
    quality: int,
    dry_run: bool,
    force: bool,
    work_root: Path,
    xml_dir: Path | None = None,
) -> dict:
    import numpy as np
    from PIL import Image

    out_dir = assets_root / spec.id
    lung_dir = out_dir / "lung"
    med_dir = out_dir / "mediastinum"
    report_path = reports_root / f"{spec.id}.json"

    if report_path.exists() and not force:
        print(f"[skip] {spec.id}: reports/tcia/{spec.id}.json zaten var (--force ile yeniden uret)")
        return json.loads(report_path.read_text(encoding="utf-8"))

    print(f"[indir] {spec.id} <- seriesUID={spec.seriesUID}")
    work_root.mkdir(parents=True, exist_ok=True)
    series_work = Path(tempfile.mkdtemp(prefix=f"tcia_{spec.id}_", dir=str(work_root)))
    zip_path = series_work / "series.zip"
    extract_dir = series_work / "dcm"
    extract_dir.mkdir(parents=True, exist_ok=True)

    try:
        zip_bytes = download_series_zip(spec.seriesUID, zip_path)
        print(f"       zip boyutu: {zip_bytes / 1e6:.1f} MB")
        dcm_files = extract_zip(zip_path, extract_dir)
        ds_list = load_and_sort_dicoms(dcm_files)
        if not ds_list:
            raise RuntimeError("DICOM okunamadi / pixel_array yok")

        # bazi LIDC serileri toraksin altina (ust abdomen: karaciger/bobrek) tasar;
        # fixtures'ta "sliceRange": [start, end] (0-tabanli, end haric) verilirse
        # yalnizca toraks kismi kullanilir.
        slice_range = spec.extra.get("sliceRange")
        if slice_range:
            s0, s1 = slice_range
            ds_list_full_len = len(ds_list)
            ds_list = ds_list[s0:s1]
            print(f"       [kirpma] sliceRange={slice_range} -> {len(ds_list)}/{ds_list_full_len} kesit kullanilacak")
            if not ds_list:
                raise RuntimeError("sliceRange sonrasi kesit kalmadi")

        selected = ds_list[::every]
        if len(selected) < 8:
            selected = ds_list  # cok kisa seri, seyreltme yapma

        # --- LIDC XML nodul isaretlemeleri: varsa nodulu kapsayan kesitleri
        # zorla kare setine ekle (seyreltmeyi nodul cevresinde sıklastir) ---
        annotation_records: list[dict] = []
        annotation_clusters_summary: list[dict] = []
        if xml_dir is not None:
            xml_path = parse_annotations.find_series_xml(xml_dir, spec.seriesUID)
            if xml_path is not None:
                sessions = parse_annotations.parse_sessions(xml_path)
                row_spacing, col_spacing = [float(v) for v in ds_list[0].PixelSpacing]
                clusters = parse_annotations.cluster_nodules(sessions, spacing_x=col_spacing, spacing_y=row_spacing)
                annotation_clusters_summary = [
                    {"readerCount": c["readerCount"], "avgCharacteristics": c["avgCharacteristics"]}
                    for c in clusters
                ]
                if clusters:
                    best = clusters[0]
                    recs, sop_uids = parse_annotations.build_frame_annotations(
                        best, columns=int(ds_list[0].Columns), rows=int(ds_list[0].Rows), finding="nodule_mass"
                    )
                    annotation_records = recs
                    forced = [ds for ds in ds_list if getattr(ds, "SOPInstanceUID", None) in set(sop_uids)]
                    if forced:
                        by_sop = {getattr(ds, "SOPInstanceUID", None): ds for ds in selected}
                        merged = list(selected)
                        for ds in forced:
                            if getattr(ds, "SOPInstanceUID", None) not in by_sop:
                                merged.append(ds)
                        # orijinal sira (InstanceNumber) korunarak tekrar sirala
                        order = {id(ds): i for i, ds in enumerate(ds_list)}
                        merged.sort(key=lambda d: order[id(d)])
                        added = len(merged) - len(selected)
                        selected = merged
                        print(f"       [anotasyon] nodul kesitleri zorla eklendi: +{added} kare "
                              f"(readerCount={best['readerCount']}, toplam kume={len(clusters)})")
                    else:
                        print(f"       [anotasyon] en iyi kume readerCount={best['readerCount']} ama SOP eslesmesi bulunamadi")
                else:
                    print("       [anotasyon] bu seri icin nodul kumesi yok (XML var, kontur/roi bos)")
            else:
                print("       [anotasyon] bu seri icin LidcReadMessage XML bulunamadi")

        print(f"       toplam kesit={len(ds_list)}  secilen={len(selected)} (her {every}. kesit)")

        if dry_run:
            return {
                "id": spec.id,
                "dryRun": True,
                "totalSlices": len(ds_list),
                "selectedFrames": len(selected),
            }

        lung_dir.mkdir(parents=True, exist_ok=True)
        med_dir.mkdir(parents=True, exist_ok=True)

        total_bytes = 0
        lung_frames = []
        med_frames = []
        sop_to_frame_idx = {getattr(ds, "SOPInstanceUID", None): idx for idx, ds in enumerate(selected)}

        for idx, ds in enumerate(selected):
            slope = float(getattr(ds, "RescaleSlope", 1))
            intercept = float(getattr(ds, "RescaleIntercept", 0))
            pixels = ds.pixel_array.astype(np.float32)
            hu = pixels * slope + intercept

            for window_name, win_dir, frames_list in (
                ("lung", lung_dir, lung_frames),
                ("mediastinum", med_dir, med_frames),
            ):
                win = WINDOWS[window_name]
                arr8 = hu_window_to_uint8(hu, win["center"], win["width"])
                img = Image.fromarray(arr8, mode="L")
                if img.size != (size, size):
                    img = img.resize((size, size), Image.LANCZOS)
                fname = f"{idx:03d}.webp"
                fpath = win_dir / fname
                img.save(fpath, format="WEBP", quality=quality)
                total_bytes += fpath.stat().st_size
                frames_list.append(f"assets/ct/{spec.id}/{window_name}/{fname}")

        # anotasyon kayitlarina nihai kare indeksini isle (kesit SOP UID -> frame idx)
        resolved_annotations = []
        for rec in annotation_records:
            fidx = sop_to_frame_idx.get(rec["sopUID"])
            if fidx is None:
                continue  # beklenmez (zorla eklendi) ama guvenlik icin atla
            rec_out = dict(rec)
            rec_out["frameIndex"] = fidx
            del rec_out["sopUID"]
            resolved_annotations.append(rec_out)

        report = {
            "id": spec.id,
            "topic": spec.topic,
            "note": spec.note,
            "patientId": spec.patientId,
            "seriesUID": spec.seriesUID,
            "totalSlicesInSeries": len(ds_list),
            "frameCount": len(selected),
            "everyNthSlice": every,
            "frameSize": size,
            "webpQuality": quality,
            "windows": WINDOWS,
            "totalBytes": total_bytes,
            "totalMB": round(total_bytes / 1e6, 3),
            "lungFrames": lung_frames,
            "mediastinumFrames": med_frames,
            "license": LICENSE_INFO,
            "annotations": resolved_annotations,
            "annotationClustersSummary": annotation_clusters_summary,
            "characteristicsScale": parse_annotations.CHARACTERISTIC_SCALE_NOTES if resolved_annotations else {},
        }
        reports_root.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"       [ok] {spec.id}: {len(selected)} kare x 2 pencere, {total_bytes/1e6:.2f} MB -> {report_path}")
        return report
    finally:
        shutil.rmtree(series_work, ignore_errors=True)


def build_manifest(reports_root: Path) -> list[dict]:
    manifest = []
    for p in sorted(reports_root.glob("*.json")):
        if p.name == "manifest.json":
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        if data.get("dryRun"):
            continue
        manifest.append(
            {
                "id": data["id"],
                "modality": "CT",
                "viewPosition": "CT_AXIAL",
                "population": "yetiskin",
                "topic": data["topic"],
                "frameCount": data["frameCount"],
                "stack": [
                    {
                        "window": "lung",
                        "label": WINDOWS["lung"]["label"],
                        "frames": data["lungFrames"],
                    },
                    {
                        "window": "mediastinum",
                        "label": WINDOWS["mediastinum"]["label"],
                        "frames": data["mediastinumFrames"],
                    },
                ],
                "license": {
                    **LICENSE_INFO,
                    "patientId": data["patientId"],
                    "seriesUID": data["seriesUID"],
                },
                "labelSource": "expert_reading",
                "note": data.get("note", ""),
                "annotations": data.get("annotations", []),
            }
        )
    manifest_path = reports_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[manifest] {len(manifest)} seri -> {manifest_path}")
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    ap.add_argument("--reports", type=Path, default=DEFAULT_REPORTS)
    ap.add_argument("--limit", type=int, default=None, help="fixtures listesinden en fazla N seri isle")
    ap.add_argument("--every", type=int, default=4, help="kac kesitte bir kare alinsin (varsayilan 4)")
    ap.add_argument("--size", type=int, default=768, help="kare kenar boyutu (px)")
    ap.add_argument("--quality", type=int, default=80, help="WebP kalite (0-100)")
    ap.add_argument("--dry-run", action="store_true", help="indir+say, kare uretme")
    ap.add_argument("--force", action="store_true", help="rapor var olsa da yeniden uret")
    ap.add_argument("--only", type=str, default=None, help="virgulle ayrilmis id listesi ile filtrele")
    ap.add_argument("--manifest-only", action="store_true", help="sadece reports/tcia/*.json -> manifest.json birlestir")
    ap.add_argument("--work-dir", type=Path, default=None, help="gecici indirme klasoru (varsayilan: sistem tmp)")
    ap.add_argument("--xml-dir", type=Path, default=None,
                     help="acilmis LIDC-XML-only klasoru (nodul isaretlemeleri icin; verilmezse anotasyon uretilmez)")
    args = ap.parse_args()

    if args.manifest_only:
        build_manifest(args.reports)
        return

    specs = load_specs(args.input)
    if args.only:
        wanted = set(args.only.split(","))
        specs = [s for s in specs if s.id in wanted]
    if args.limit is not None:
        specs = specs[: args.limit]

    work_root = args.work_dir or Path(tempfile.gettempdir()) / "egemed-tcia-work"

    for spec in specs:
        try:
            process_series(
                spec,
                assets_root=args.assets,
                reports_root=args.reports,
                every=args.every,
                size=args.size,
                quality=args.quality,
                dry_run=args.dry_run,
                force=args.force,
                work_root=work_root,
                xml_dir=args.xml_dir,
            )
        except (urllib.error.URLError, RuntimeError, zipfile.BadZipFile) as exc:
            print(f"[HATA] {spec.id}: {exc}", file=sys.stderr)

    if not args.dry_run:
        build_manifest(args.reports)


if __name__ == "__main__":
    main()
