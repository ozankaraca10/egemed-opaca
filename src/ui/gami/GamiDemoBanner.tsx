import { IconInfo } from '../icons'

/** Kapatılamaz "Demo verisi" şeridi — v1'de sıralama demo akranlarla oluşturulur (yol haritası §1). */
export function GamiDemoBanner() {
  return (
    <div className="gami-demo" role="note">
      <IconInfo width={16} height={16} /> Demo verisi — gösterilen kişiler, puanlar ve sıralamalar örnektir; gerçek öğrenci verisi değildir.
    </div>
  )
}
