// Region + Province seed data for Thailand (DITECH Installation Planner)
// Operational + geographical model — BANGKOK = Bangkok & Vicinity (not just Bangkok province)

export const REGIONS_SEED = [
  { code: 'BANGKOK',   name: 'Bangkok & Vicinity', nameThai: 'กรุงเทพและปริมณฑล',           sortOrder: 1 },
  { code: 'CENTRAL',   name: 'Central',            nameThai: 'ภาคกลาง',                     sortOrder: 2 },
  { code: 'NORTH',     name: 'Northern',           nameThai: 'ภาคเหนือ',                     sortOrder: 3 },
  { code: 'NORTHEAST', name: 'Northeastern',       nameThai: 'ภาคตะวันออกเฉียงเหนือ',      sortOrder: 4 },
  { code: 'EAST',      name: 'Eastern',            nameThai: 'ภาคตะวันออก',                 sortOrder: 5 },
  { code: 'SOUTH',     name: 'Southern',           nameThai: 'ภาคใต้',                       sortOrder: 6 },
  { code: 'WEST',      name: 'Western',            nameThai: 'ภาคตะวันตก',                   sortOrder: 7 },
];

// Province → Region mapping
// Codes follow ISO-style: TH-{ID2 abbrev}, name as in PROVINCES_EN list
export const PROVINCES_SEED: Array<{ code: string; name: string; nameThai: string; regionCode: string }> = [
  // BANGKOK & Vicinity (6) — operational region, includes Nakhon Pathom
  { code: 'BANGKOK',       name: 'Bangkok',        nameThai: 'กรุงเทพมหานคร',  regionCode: 'BANGKOK' },
  { code: 'NONTHABURI',    name: 'Nonthaburi',     nameThai: 'นนทบุรี',         regionCode: 'BANGKOK' },
  { code: 'PATHUM_THANI',  name: 'Pathum Thani',   nameThai: 'ปทุมธานี',        regionCode: 'BANGKOK' },
  { code: 'SAMUT_PRAKAN',  name: 'Samut Prakan',   nameThai: 'สมุทรปราการ',     regionCode: 'BANGKOK' },
  { code: 'SAMUT_SAKHON',  name: 'Samut Sakhon',   nameThai: 'สมุทรสาคร',       regionCode: 'BANGKOK' },
  { code: 'NAKHON_PATHOM', name: 'Nakhon Pathom',  nameThai: 'นครปฐม',          regionCode: 'BANGKOK' },

  // CENTRAL (16)
  { code: 'ANG_THONG',          name: 'Ang Thong',                   nameThai: 'อ่างทอง',         regionCode: 'CENTRAL' },
  { code: 'AYUTTHAYA',          name: 'Phra Nakhon Si Ayutthaya',    nameThai: 'พระนครศรีอยุธยา', regionCode: 'CENTRAL' },
  { code: 'CHAI_NAT',           name: 'Chai Nat',                    nameThai: 'ชัยนาท',          regionCode: 'CENTRAL' },
  { code: 'KAMPHAENG_PHET',     name: 'Kamphaeng Phet',              nameThai: 'กำแพงเพชร',       regionCode: 'CENTRAL' },
  { code: 'LOPBURI',            name: 'Lopburi',                     nameThai: 'ลพบุรี',          regionCode: 'CENTRAL' },
  { code: 'NAKHON_SAWAN',       name: 'Nakhon Sawan',                nameThai: 'นครสวรรค์',       regionCode: 'CENTRAL' },
  { code: 'PHETCHABUN',         name: 'Phetchabun',                  nameThai: 'เพชรบูรณ์',       regionCode: 'CENTRAL' },
  { code: 'PHICHIT',            name: 'Phichit',                     nameThai: 'พิจิตร',          regionCode: 'CENTRAL' },
  { code: 'PHITSANULOK',        name: 'Phitsanulok',                 nameThai: 'พิษณุโลก',        regionCode: 'CENTRAL' },
  { code: 'SARABURI',           name: 'Saraburi',                    nameThai: 'สระบุรี',         regionCode: 'CENTRAL' },
  { code: 'SING_BURI',          name: 'Sing Buri',                   nameThai: 'สิงห์บุรี',       regionCode: 'CENTRAL' },
  { code: 'SUKHOTHAI',          name: 'Sukhothai',                   nameThai: 'สุโขทัย',         regionCode: 'CENTRAL' },
  { code: 'SUPHAN_BURI',        name: 'Suphan Buri',                 nameThai: 'สุพรรณบุรี',      regionCode: 'CENTRAL' },
  { code: 'UTHAI_THANI',        name: 'Uthai Thani',                 nameThai: 'อุทัยธานี',       regionCode: 'CENTRAL' },
  { code: 'NAKHON_NAYOK',       name: 'Nakhon Nayok',                nameThai: 'นครนายก',         regionCode: 'CENTRAL' },

  // NORTH (9)
  { code: 'CHIANG_MAI',     name: 'Chiang Mai',     nameThai: 'เชียงใหม่',     regionCode: 'NORTH' },
  { code: 'CHIANG_RAI',     name: 'Chiang Rai',     nameThai: 'เชียงราย',      regionCode: 'NORTH' },
  { code: 'LAMPANG',        name: 'Lampang',        nameThai: 'ลำปาง',         regionCode: 'NORTH' },
  { code: 'LAMPHUN',        name: 'Lamphun',        nameThai: 'ลำพูน',         regionCode: 'NORTH' },
  { code: 'MAE_HONG_SON',   name: 'Mae Hong Son',   nameThai: 'แม่ฮ่องสอน',    regionCode: 'NORTH' },
  { code: 'NAN',            name: 'Nan',            nameThai: 'น่าน',          regionCode: 'NORTH' },
  { code: 'PHAYAO',         name: 'Phayao',         nameThai: 'พะเยา',         regionCode: 'NORTH' },
  { code: 'PHRAE',          name: 'Phrae',          nameThai: 'แพร่',          regionCode: 'NORTH' },
  { code: 'UTTARADIT',      name: 'Uttaradit',      nameThai: 'อุตรดิตถ์',     regionCode: 'NORTH' },

  // NORTHEAST (20)
  { code: 'AMNAT_CHAROEN',     name: 'Amnat Charoen',     nameThai: 'อำนาจเจริญ',    regionCode: 'NORTHEAST' },
  { code: 'BUENG_KAN',         name: 'Bueng Kan',         nameThai: 'บึงกาฬ',        regionCode: 'NORTHEAST' },
  { code: 'BURIRAM',           name: 'Buri Ram',          nameThai: 'บุรีรัมย์',     regionCode: 'NORTHEAST' },
  { code: 'CHAIYAPHUM',        name: 'Chaiyaphum',        nameThai: 'ชัยภูมิ',       regionCode: 'NORTHEAST' },
  { code: 'KALASIN',           name: 'Kalasin',           nameThai: 'กาฬสินธุ์',     regionCode: 'NORTHEAST' },
  { code: 'KHON_KAEN',         name: 'Khon Kaen',         nameThai: 'ขอนแก่น',       regionCode: 'NORTHEAST' },
  { code: 'LOEI',              name: 'Loei',              nameThai: 'เลย',           regionCode: 'NORTHEAST' },
  { code: 'MAHA_SARAKHAM',     name: 'Maha Sarakham',     nameThai: 'มหาสารคาม',     regionCode: 'NORTHEAST' },
  { code: 'MUKDAHAN',          name: 'Mukdahan',          nameThai: 'มุกดาหาร',      regionCode: 'NORTHEAST' },
  { code: 'NAKHON_PHANOM',     name: 'Nakhon Phanom',     nameThai: 'นครพนม',        regionCode: 'NORTHEAST' },
  { code: 'NAKHON_RATCHASIMA', name: 'Nakhon Ratchasima', nameThai: 'นครราชสีมา',   regionCode: 'NORTHEAST' },
  { code: 'NONG_BUA_LAMPHU',   name: 'Nong Bua Lamphu',   nameThai: 'หนองบัวลำภู',  regionCode: 'NORTHEAST' },
  { code: 'NONG_KHAI',         name: 'Nong Khai',         nameThai: 'หนองคาย',       regionCode: 'NORTHEAST' },
  { code: 'ROI_ET',            name: 'Roi Et',            nameThai: 'ร้อยเอ็ด',     regionCode: 'NORTHEAST' },
  { code: 'SAKON_NAKHON',      name: 'Sakon Nakhon',      nameThai: 'สกลนคร',        regionCode: 'NORTHEAST' },
  { code: 'SISAKET',           name: 'Sisaket',           nameThai: 'ศรีสะเกษ',     regionCode: 'NORTHEAST' },
  { code: 'SURIN',             name: 'Surin',             nameThai: 'สุรินทร์',     regionCode: 'NORTHEAST' },
  { code: 'UBON_RATCHATHANI',  name: 'Ubon Ratchathani',  nameThai: 'อุบลราชธานี', regionCode: 'NORTHEAST' },
  { code: 'UDON_THANI',        name: 'Udon Thani',        nameThai: 'อุดรธานี',     regionCode: 'NORTHEAST' },
  { code: 'YASOTHON',          name: 'Yasothon',          nameThai: 'ยโสธร',         regionCode: 'NORTHEAST' },

  // EAST (7)
  { code: 'CHACHOENGSAO', name: 'Chachoengsao', nameThai: 'ฉะเชิงเทรา', regionCode: 'EAST' },
  { code: 'CHANTHABURI',  name: 'Chanthaburi',  nameThai: 'จันทบุรี',   regionCode: 'EAST' },
  { code: 'CHONBURI',     name: 'Chonburi',     nameThai: 'ชลบุรี',     regionCode: 'EAST' },
  { code: 'PRACHINBURI',  name: 'Prachinburi',  nameThai: 'ปราจีนบุรี', regionCode: 'EAST' },
  { code: 'RAYONG',       name: 'Rayong',       nameThai: 'ระยอง',       regionCode: 'EAST' },
  { code: 'SA_KAEO',      name: 'Sa Kaeo',      nameThai: 'สระแก้ว',     regionCode: 'EAST' },
  { code: 'TRAT',         name: 'Trat',         nameThai: 'ตราด',         regionCode: 'EAST' },

  // SOUTH (14)
  { code: 'CHUMPHON',             name: 'Chumphon',             nameThai: 'ชุมพร',        regionCode: 'SOUTH' },
  { code: 'KRABI',                name: 'Krabi',                nameThai: 'กระบี่',        regionCode: 'SOUTH' },
  { code: 'NAKHON_SI_THAMMARAT',  name: 'Nakhon Si Thammarat',  nameThai: 'นครศรีธรรมราช', regionCode: 'SOUTH' },
  { code: 'NARATHIWAT',           name: 'Narathiwat',           nameThai: 'นราธิวาส',     regionCode: 'SOUTH' },
  { code: 'PATTANI',              name: 'Pattani',              nameThai: 'ปัตตานี',       regionCode: 'SOUTH' },
  { code: 'PHANG_NGA',            name: 'Phang Nga',            nameThai: 'พังงา',         regionCode: 'SOUTH' },
  { code: 'PHATTHALUNG',          name: 'Phatthalung',          nameThai: 'พัทลุง',        regionCode: 'SOUTH' },
  { code: 'PHUKET',               name: 'Phuket',               nameThai: 'ภูเก็ต',        regionCode: 'SOUTH' },
  { code: 'RANONG',               name: 'Ranong',               nameThai: 'ระนอง',         regionCode: 'SOUTH' },
  { code: 'SATUN',                name: 'Satun',                nameThai: 'สตูล',          regionCode: 'SOUTH' },
  { code: 'SONGKHLA',             name: 'Songkhla',             nameThai: 'สงขลา',         regionCode: 'SOUTH' },
  { code: 'SURAT_THANI',          name: 'Surat Thani',          nameThai: 'สุราษฎร์ธานี',  regionCode: 'SOUTH' },
  { code: 'TRANG',                name: 'Trang',                nameThai: 'ตรัง',          regionCode: 'SOUTH' },
  { code: 'YALA',                 name: 'Yala',                 nameThai: 'ยะลา',          regionCode: 'SOUTH' },

  // WEST (5)
  { code: 'KANCHANABURI',        name: 'Kanchanaburi',        nameThai: 'กาญจนบุรี',     regionCode: 'WEST' },
  { code: 'PHETCHABURI',         name: 'Phetchaburi',         nameThai: 'เพชรบุรี',      regionCode: 'WEST' },
  { code: 'PRACHUAP_KHIRI_KHAN', name: 'Prachuap Khiri Khan', nameThai: 'ประจวบคีรีขันธ์', regionCode: 'WEST' },
  { code: 'RATCHABURI',          name: 'Ratchaburi',          nameThai: 'ราชบุรี',       regionCode: 'WEST' },
  { code: 'TAK',                 name: 'Tak',                 nameThai: 'ตาก',           regionCode: 'WEST' },
];

/**
 * Migration helper: map old `province` text + `storeRegion` enum
 * to a new (regionCode, provinceCode) tuple.
 *
 * Strategy:
 * - If the province text matches a known province → use that province + its region
 * - Else if old storeRegion=BANGKOK → BANGKOK region, no province
 * - Else (UPC with unknown province) → fall back to NULL — admin will fix manually
 *
 * Old data hint:
 *   storeRegion=BANGKOK with empty province → keep BANGKOK region, null province
 *   storeRegion=UPC with empty province     → null region, null province (must fix)
 */
export function classifyOldPlan(
  oldStoreRegion: 'BANGKOK' | 'UPC' | string,
  oldProvinceText: string | null
): { regionCode: string | null; provinceCode: string | null } {
  if (!oldProvinceText || oldProvinceText.trim() === '') {
    if (oldStoreRegion === 'BANGKOK') return { regionCode: 'BANGKOK', provinceCode: null };
    return { regionCode: null, provinceCode: null };
  }
  const trimmed = oldProvinceText.trim();
  // Try exact match first
  const exact = PROVINCES_SEED.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (exact) return { regionCode: exact.regionCode, provinceCode: exact.code };
  // Try fuzzy match (without spaces)
  const norm = trimmed.toLowerCase().replace(/\s+/g, '');
  const fuzzy = PROVINCES_SEED.find(
    (p) => p.name.toLowerCase().replace(/\s+/g, '') === norm
  );
  if (fuzzy) return { regionCode: fuzzy.regionCode, provinceCode: fuzzy.code };
  // Unknown — keep old region as best guess
  if (oldStoreRegion === 'BANGKOK') return { regionCode: 'BANGKOK', provinceCode: null };
  return { regionCode: null, provinceCode: null };
}
