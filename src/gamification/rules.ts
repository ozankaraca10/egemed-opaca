/** EGEMED Opaca — oyunlaştırma sayısal kuralları (TEK kaynak).
 *  Yol haritası §2.5: "Tüm sayısal kurallar rules.ts'te tek yerde." Değiştirmek gerekirse yalnız
 *  bu dosya düzenlenir; diğer modüller bu sabitleri okur, kendi sabitlerini üretmez. */

export const RULES = {
  xp: {
    /** Uygulama: vaka başına temel XP. */
    practiceCase: 5,
    /** Uygulama: ustalık (mastery) vakası için ek XP (vaka başına). */
    practiceMasteryBonus: 5,
    /** Uygulama: ipucu başına ceza (vaka başına en az 0'a kadar düşer). */
    practiceHintPenalty: 2,
    /** Değerlendirme: vaka başına XP. */
    assessmentCase: 10,
    /** Değerlendirme: bu eşiğin (oturum puanı) üzerinde/eşit ise başarı bonusu verilir. */
    assessmentBonusThreshold: 80,
    assessmentBonus: 20,
    /** Öğrenme: bir konu ilk kez incelendiğinde (konu başına yalnız bir kez). */
    learnTopicFirstView: 2,
  },
  level: {
    /** n. seviyenin genişliği = unitXp × n (1: 0–100, 2: 100–300, 3: 300–600, 4: 600–1000, 5: 1000–1500 …). */
    unitXp: 100,
  },
  week: {
    /** Haftalık hedef 1: en az bu kadar değerlendirme oturumu. */
    assessmentSessionsGoal: 5,
    /** Haftalık hedef 2: haftalık değerlendirme ortalaması bu eşiğin üzerinde/eşit (en az 1 oturumla). */
    avgScoreGoal: 80,
    /** Haftalık hedef 3: bu hafta kazanılan yeni rozet sayısı. */
    newBadgesGoal: 2,
  },
  ranking: {
    /** Dönem puanı: en iyi N değerlendirmenin ortalaması. */
    bestOfCount: 3,
    /** Sıralamaya girmek için asgari değerlendirme sayısı. */
    minAttempts: 2,
    /** Dönem puanı yuvarlama (ondalık basamak). */
    roundDecimals: 1,
  },
  storage: {
    key: 'opaca.gami.v1',
    /** attempts dizisinin tutacağı en fazla kayıt sayısı (en eskiler düşer). */
    maxAttempts: 500,
  },
  badges: {
    sharpEye: [10, 25, 50] as const, // bronz / gümüş / altın — isabetli lokalizasyon
    filmQuality: 10,
    interpreter: 10,
    pleura: 5,
    cardiac: 5,
    nodule: 10,
    tb: 10,
    pediatric: 5,
    diaphragm: 5,
    bone: 5,
    vascular: 3,
    streak: [3, 7, 30] as const,
    marathon: 50, // değerlendirme oturumu sayısı
    explorerTopics: 10, // öğrenme modunda incelenen farklı konu
    practiceGrit: 20, // uygulama vaka sayısı
    thresholdScore: 80, // "Eşik Aşıldı" rozeti — ilk kez bu puana ulaşma
    noHintsCaseMin: 10, // "İpucusuz" rozeti — ipucusuz oturumdaki asgari vaka sayısı
  },
} as const
