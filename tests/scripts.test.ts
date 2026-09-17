import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
// @ts-expect-error — JS modülü
import { parseCsv, csvObjects, csvEscape } from '../scripts/lib/csv.mjs'
// @ts-expect-error — JS modülü
import { parseDicom, toGray8, dicomAgeYears, writeTestDicom } from '../scripts/lib/dicom.mjs'
// @ts-expect-error — JS modülü
import { normBox, setFinding, setNegative, emptyRecord, capPerFinding, safeId } from '../scripts/lib/cxr-common.mjs'

const ROOT = path.resolve(__dirname, '..')

describe('CSV', () => {
  it('tırnak, gömülü virgül ve satır sonu', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n1,\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['1', '']])
  })
  it('NIH BBox başlığı: çok hücreli sütun konumla okunur', () => {
    const { header, records } = csvObjects('Image Index,Finding Label,Bbox [x,y,w,h],,,\nf.png,Nodule,1,2,3,4\n')
    expect(header[2]).toBe('Bbox [x')
    expect(records[0]._cells.slice(2, 6)).toEqual(['1', '2', '3', '4'])
  })
  it('BOM ve kaçış', () => {
    expect(csvObjects('\ufeffa\n1').records[0].a).toBe('1')
    expect(csvEscape('a,"b"')).toBe('"a,""b"""')
    expect(csvEscape(3)).toBe('3')
  })
})

describe('DICOM', () => {
  const pixels = Buffer.from(Array.from({ length: 16 }, (_, i) => i * 16))
  it('sıkıştırmasız 8 bit dosyayı okur', () => {
    const d = parseDicom(writeTestDicom({ rows: 4, cols: 4, pixels, age: '061Y', sex: 'M', view: 'AP' }))
    expect(d.supported).toBe(true)
    expect(d.isJpeg).toBe(false)
    expect([d.Rows, d.Columns, d.BitsAllocated]).toEqual([4, 4, 8])
    expect(d.ViewPosition).toBe('AP')
    expect(dicomAgeYears(d.PatientAge)).toBe(61)
    expect([...toGray8(d)]).toEqual([...pixels])
  })
  it('MONOCHROME1 ters çevrilir', () => {
    const d = parseDicom(writeTestDicom({ rows: 4, cols: 4, pixels, photometric: 'MONOCHROME1' }))
    expect(toGray8(d)[0]).toBe(255)
  })
  it('DICM imzası yoksa hata', () => {
    expect(() => parseDicom(Buffer.alloc(200))).toThrow(/DICM/)
  })
  it('yaş dizeleri', () => {
    expect(dicomAgeYears('62')).toBe(62)
    expect(dicomAgeYears('018M')).toBe(1)
    expect(dicomAgeYears('')).toBeNull()
    expect(dicomAgeYears('abc')).toBeNull()
  })
})

describe('ortak yardımcılar', () => {
  it('kutu normalizasyonu sınırlar', () => {
    expect(normBox(512, 256, 256, 128, 1024, 1024)).toEqual({ x: 0.5, y: 0.25, w: 0.25, h: 0.125 })
    const b = normBox(900, -10, 400, 50, 1000, 1000)
    expect(b.x + b.w).toBeLessThanOrEqual(1)
    expect(b.y).toBe(0)
  })
  it('uzman kaynak NLP etiketini ezer, tersi olmaz; negatif uzman pozitifini silmez', () => {
    const r = emptyRecord('x', 'd', 'f')
    setFinding(r, 'pneumothorax', 'report_nlp')
    setFinding(r, 'pneumothorax', 'expert_panel')
    setFinding(r, 'pneumothorax', 'report_nlp')
    expect(r.findings.pneumothorax).toBe('expert_panel')
    setNegative(r, 'pneumothorax', 'expert_panel')
    expect(r.findings.pneumothorax).toBe('expert_panel')
    setFinding(r, 'fracture', 'report_nlp')
    setNegative(r, 'fracture', 'expert_panel')
    expect(r.findings.fracture).toBeUndefined()
    expect(r.negatives.fracture).toBe('expert_panel')
  })
  it('bulgu başına üst sınır uzman kutulu kayıtları önceler', () => {
    const mk = (id: string, src: string, box: boolean) => {
      const r = emptyRecord(id, 'd', id)
      r.findings.nodule_mass = src
      if (box) r.annotations.push({ finding: 'nodule_mass', source: 'expert_bbox', x: 0, y: 0, w: 0.1, h: 0.1 })
      return r
    }
    const out = capPerFinding([mk('c', 'report_nlp', false), mk('b', 'expert_panel', false), mk('a', 'expert_bbox', true)], 2)
    expect(out.map((r: { id: string }) => r.id)).toEqual(['a', 'b'])
  })
  it('güvenli id', () => {
    expect(safeId('0004cfab-14fd.dcm')).toBe('0004cfab_14fd')
  })
})

/* ---------------- içe aktarıcı entegrasyonu (geçici dizin; depo kirlenmez) ---------------- */
async function png(file: string, size = 64) {
  await sharp({ create: { width: size, height: size, channels: 3, background: { r: 90, g: 90, b: 90 } } }).png().toFile(file)
}

function run(script: string, args: string[], out: string) {
  return execFileSync('node', [path.join(ROOT, 'scripts', script), ...args], {
    env: { ...process.env, OPACA_OUT_DIR: out },
    encoding: 'utf8',
  })
}

describe('içe aktarıcılar', () => {
  it('RSNA: opasite kutuları ve radyolog normal sınıfı; belirsiz sınıf alınmaz', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsna-'))
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'opaca-out-'))
    fs.mkdirSync(path.join(dir, 'stage_2_train_images'))
    const px = Buffer.alloc(100 * 100, 128)
    for (const id of ['p-op', 'p-norm', 'p-other']) {
      fs.writeFileSync(path.join(dir, 'stage_2_train_images', `${id}.dcm`), writeTestDicom({ rows: 100, cols: 100, pixels: px, age: '40', view: 'PA' }))
    }
    fs.writeFileSync(
      path.join(dir, 'stage_2_train_labels.csv'),
      'patientId,x,y,width,height,Target\np-op,10,20,30,40,1\np-op,60,20,20,20,1\np-norm,,,,,0\np-other,,,,,0\n'
    )
    fs.writeFileSync(
      path.join(dir, 'stage_2_detailed_class_info.csv'),
      'patientId,class\np-op,Lung Opacity\np-op,Lung Opacity\np-norm,Normal\np-other,No Lung Opacity / Not Normal\n'
    )
    run('import-rsna.mjs', [dir], out)
    const data = JSON.parse(fs.readFileSync(path.join(out, 'images.json'), 'utf8'))
    expect(data.count).toBe(2)
    const op = data.records.find((r: { id: string }) => r.id === 'rsna_p_op')
    expect(op.findings).toEqual({ airspace_opacity: 'expert_bbox' })
    expect(op.annotations).toHaveLength(2)
    expect(op.annotations[0]).toMatchObject({ x: 0.1, y: 0.2, w: 0.3, h: 0.4, source: 'expert_bbox' })
    expect(op.ageYears).toBe(40)
    expect(op.viewPosition).toBe('PA')
    const norm = data.records.find((r: { id: string }) => r.id === 'rsna_p_norm')
    expect(norm.findings).toEqual({ normal: 'expert_reading' })
    expect(norm.negatives).toEqual({ airspace_opacity: 'expert_reading' })
    expect(fs.existsSync(path.join(out, 'runtime', 'rsna_p_op.webp'))).toBe(true)
  }, 30000)

  it('NIH: yalnız radyolog bilgili görüntüler; kutu ölçeği ve panel negatifleri', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nih-'))
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'opaca-out-'))
    fs.mkdirSync(path.join(dir, 'images_001', 'images'), { recursive: true })
    for (const f of ['00000001_000.png', '00000002_000.png', '00000003_000.png', '00000004_000.png']) await png(path.join(dir, 'images_001', 'images', f), 512)
    fs.writeFileSync(
      path.join(dir, 'Data_Entry_2017.csv'),
      [
        'Image Index,Finding Labels,Follow-up #,Patient ID,Patient Age,Patient Gender,View Position,OriginalImage[Width,Height],OriginalImagePixelSpacing[x,y]',
        '00000001_000.png,Nodule|Effusion,0,1,058Y,M,PA,2500,2048,0.1,0.1',
        '00000002_000.png,No Finding,0,2,12,F,AP,2500,2048,0.1,0.1',
        '00000003_000.png,Pneumothorax,0,3,45,F,PA,2500,2048,0.1,0.1',
        '00000004_000.png,Infiltration,0,4,45,F,PA,2500,2048,0.1,0.1',
      ].join('\n')
    )
    fs.writeFileSync(path.join(dir, 'BBox_List_2017.csv'), 'Image Index,Finding Label,Bbox [x,y,w,h],,,\n00000001_000.png,Nodule,512,256,102.4,51.2\n')
    const google = path.join(dir, 'four.csv')
    fs.writeFileSync(
      google,
      'Image Index,Finding Labels,Follow-up #,Patient ID,Patient Age,Patient Gender,View Position,OriginalImage[Width,Height],OriginalImagePixelSpacing[x,y],Fracture,Pneumothorax,Airspace opacity,Nodule or mass,Set Id\r\n' +
        '00000003_000.png,Pneumothorax,0,3,45,F,PA,2500,2048,0.1,0.1,NO,YES,NO,NO,test\r\n' +
        '00000002_000.png,No Finding,0,2,12,F,AP,2500,2048,0.1,0.1,NO,NO,NO,NO,test\r\n'
    )
    const log = run('import-nih.mjs', [dir, '--google', google], out)
    expect(log).toMatch(/3 görüntü/)
    const recs = JSON.parse(fs.readFileSync(path.join(out, 'images.json'), 'utf8')).records
    const byId = Object.fromEntries(recs.map((r: { id: string }) => [r.id, r]))
    expect(byId.nih_00000004_000).toBeUndefined() // yalnız NLP → alınmaz
    const n1 = byId.nih_00000001_000
    expect(n1.findings).toEqual({ nodule_mass: 'expert_bbox', pleural_effusion: 'report_nlp' })
    expect(n1.annotations[0]).toMatchObject({ finding: 'nodule_mass', x: 0.5, y: 0.25, w: 0.1, h: 0.05 })
    expect(n1.ageYears).toBe(58)
    const n3 = byId.nih_00000003_000
    expect(n3.findings.pneumothorax).toBe('expert_panel')
    expect(n3.negatives).toMatchObject({ fracture: 'expert_panel', airspace_opacity: 'expert_panel', nodule_mass: 'expert_panel' })
    const n2 = byId.nih_00000002_000
    expect(n2.population).toBe('pediatrik')
    expect(n2.findings).toEqual({ no_finding_report: 'report_nlp' })

    // --include-nlp: yalnız rapor etiketli görüntü de eklenir; --replace eski kayıtları siler
    run('import-nih.mjs', [dir, '--include-nlp', '--replace'], out)
    const recs2 = JSON.parse(fs.readFileSync(path.join(out, 'images.json'), 'utf8')).records
    expect(recs2.map((r: { id: string }) => r.id)).toContain('nih_00000004_000')
    expect(recs2.find((r: { id: string }) => r.id === 'nih_00000003_000').findings.pneumothorax).toBe('report_nlp')
  }, 30000)
})
