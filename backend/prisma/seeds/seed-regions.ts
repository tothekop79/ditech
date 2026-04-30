/**
 * Seed regions + provinces for Thailand.
 *
 * 7 operational regions (geographic + business logic):
 *   BANGKOK    - Bangkok & Vicinity (incl. Nakhon Pathom for ops convenience)
 *   CENTRAL    - Central
 *   NORTH      - Northern
 *   NORTHEAST  - Northeastern (อีสาน)
 *   EAST       - Eastern
 *   SOUTH      - Southern
 *   WEST       - Western
 *
 * Provinces are seeded with English code, English name, and Thai name.
 *
 * Idempotent: uses upsert by code, safe to run multiple times.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RegionSeed {
  code: string;
  name: string;          // English
  nameThai: string;      // Thai
  sortOrder: number;
  provinces: ProvinceSeed[];
}

interface ProvinceSeed {
  code: string;          // SCREAMING_SNAKE_CASE matching English province name
  name: string;          // English
  nameThai: string;      // Thai
}

const REGIONS: RegionSeed[] = [
  {
    code: 'BANGKOK',
    name: 'Bangkok & Vicinity',
    nameThai: 'กรุงเทพและปริมณฑล',
    sortOrder: 1,
    provinces: [
      { code: 'BANGKOK',       name: 'Bangkok',        nameThai: 'กรุงเทพมหานคร' },
      { code: 'NONTHABURI',    name: 'Nonthaburi',     nameThai: 'นนทบุรี' },
      { code: 'PATHUM_THANI',  name: 'Pathum Thani',   nameThai: 'ปทุมธานี' },
      { code: 'SAMUT_PRAKAN',  name: 'Samut Prakan',   nameThai: 'สมุทรปราการ' },
      { code: 'SAMUT_SAKHON',  name: 'Samut Sakhon',   nameThai: 'สมุทรสาคร' },
      // Operationally grouped here (geographically Central)
      { code: 'NAKHON_PATHOM', name: 'Nakhon Pathom',  nameThai: 'นครปฐม' },
    ],
  },
  {
    code: 'CENTRAL',
    name: 'Central',
    nameThai: 'ภาคกลาง',
    sortOrder: 2,
    provinces: [
      { code: 'AYUTTHAYA',      name: 'Phra Nakhon Si Ayutthaya', nameThai: 'พระนครศรีอยุธยา' },
      { code: 'ANG_THONG',      name: 'Ang Thong',         nameThai: 'อ่างทอง' },
      { code: 'LOPBURI',        name: 'Lopburi',           nameThai: 'ลพบุรี' },
      { code: 'SING_BURI',      name: 'Sing Buri',         nameThai: 'สิงห์บุรี' },
      { code: 'CHAI_NAT',       name: 'Chai Nat',          nameThai: 'ชัยนาท' },
      { code: 'SUPHAN_BURI',    name: 'Suphan Buri',       nameThai: 'สุพรรณบุรี' },
      { code: 'SARABURI',       name: 'Saraburi',          nameThai: 'สระบุรี' },
      { code: 'NAKHON_NAYOK',   name: 'Nakhon Nayok',      nameThai: 'นครนายก' },
      { code: 'PHITSANULOK',    name: 'Phitsanulok',       nameThai: 'พิษณุโลก' },
      { code: 'PHICHIT',        name: 'Phichit',           nameThai: 'พิจิตร' },
      { code: 'PHETCHABUN',     name: 'Phetchabun',        nameThai: 'เพชรบูรณ์' },
      { code: 'NAKHON_SAWAN',   name: 'Nakhon Sawan',      nameThai: 'นครสวรรค์' },
      { code: 'UTHAI_THANI',    name: 'Uthai Thani',       nameThai: 'อุทัยธานี' },
      { code: 'KAMPHAENG_PHET', name: 'Kamphaeng Phet',    nameThai: 'กำแพงเพชร' },
      { code: 'SUKHOTHAI',      name: 'Sukhothai',         nameThai: 'สุโขทัย' },
    ],
  },
  {
    code: 'NORTH',
    name: 'Northern',
    nameThai: 'ภาคเหนือ',
    sortOrder: 3,
    provinces: [
      { code: 'CHIANG_MAI',   name: 'Chiang Mai',   nameThai: 'เชียงใหม่' },
      { code: 'CHIANG_RAI',   name: 'Chiang Rai',   nameThai: 'เชียงราย' },
      { code: 'LAMPHUN',      name: 'Lamphun',      nameThai: 'ลำพูน' },
      { code: 'LAMPANG',      name: 'Lampang',      nameThai: 'ลำปาง' },
      { code: 'PHRAE',        name: 'Phrae',        nameThai: 'แพร่' },
      { code: 'NAN',          name: 'Nan',          nameThai: 'น่าน' },
      { code: 'PHAYAO',       name: 'Phayao',       nameThai: 'พะเยา' },
      { code: 'MAE_HONG_SON', name: 'Mae Hong Son', nameThai: 'แม่ฮ่องสอน' },
      { code: 'UTTARADIT',    name: 'Uttaradit',    nameThai: 'อุตรดิตถ์' },
    ],
  },
  {
    code: 'NORTHEAST',
    name: 'Northeastern',
    nameThai: 'ภาคตะวันออกเฉียงเหนือ',
    sortOrder: 4,
    provinces: [
      { code: 'NAKHON_RATCHASIMA', name: 'Nakhon Ratchasima', nameThai: 'นครราชสีมา' },
      { code: 'BURI_RAM',          name: 'Buri Ram',          nameThai: 'บุรีรัมย์' },
      { code: 'SURIN',             name: 'Surin',             nameThai: 'สุรินทร์' },
      { code: 'SISAKET',           name: 'Sisaket',           nameThai: 'ศรีสะเกษ' },
      { code: 'UBON_RATCHATHANI',  name: 'Ubon Ratchathani',  nameThai: 'อุบลราชธานี' },
      { code: 'YASOTHON',          name: 'Yasothon',          nameThai: 'ยโสธร' },
      { code: 'CHAIYAPHUM',        name: 'Chaiyaphum',        nameThai: 'ชัยภูมิ' },
      { code: 'AMNAT_CHAROEN',     name: 'Amnat Charoen',     nameThai: 'อำนาจเจริญ' },
      { code: 'BUENG_KAN',         name: 'Bueng Kan',         nameThai: 'บึงกาฬ' },
      { code: 'NONG_BUA_LAMPHU',   name: 'Nong Bua Lamphu',   nameThai: 'หนองบัวลำภู' },
      { code: 'KHON_KAEN',         name: 'Khon Kaen',         nameThai: 'ขอนแก่น' },
      { code: 'UDON_THANI',        name: 'Udon Thani',        nameThai: 'อุดรธานี' },
      { code: 'LOEI',              name: 'Loei',              nameThai: 'เลย' },
      { code: 'NONG_KHAI',         name: 'Nong Khai',         nameThai: 'หนองคาย' },
      { code: 'MAHA_SARAKHAM',     name: 'Maha Sarakham',     nameThai: 'มหาสารคาม' },
      { code: 'ROI_ET',            name: 'Roi Et',            nameThai: 'ร้อยเอ็ด' },
      { code: 'KALASIN',           name: 'Kalasin',           nameThai: 'กาฬสินธุ์' },
      { code: 'SAKON_NAKHON',      name: 'Sakon Nakhon',      nameThai: 'สกลนคร' },
      { code: 'NAKHON_PHANOM',     name: 'Nakhon Phanom',     nameThai: 'นครพนม' },
      { code: 'MUKDAHAN',          name: 'Mukdahan',          nameThai: 'มุกดาหาร' },
    ],
  },
  {
    code: 'EAST',
    name: 'Eastern',
    nameThai: 'ภาคตะวันออก',
    sortOrder: 5,
    provinces: [
      { code: 'CHONBURI',     name: 'Chonburi',     nameThai: 'ชลบุรี' },
      { code: 'RAYONG',       name: 'Rayong',       nameThai: 'ระยอง' },
      { code: 'CHANTHABURI',  name: 'Chanthaburi',  nameThai: 'จันทบุรี' },
      { code: 'TRAT',         name: 'Trat',         nameThai: 'ตราด' },
      { code: 'CHACHOENGSAO', name: 'Chachoengsao', nameThai: 'ฉะเชิงเทรา' },
      { code: 'PRACHINBURI',  name: 'Prachinburi',  nameThai: 'ปราจีนบุรี' },
      { code: 'SA_KAEO',      name: 'Sa Kaeo',      nameThai: 'สระแก้ว' },
    ],
  },
  {
    code: 'SOUTH',
    name: 'Southern',
    nameThai: 'ภาคใต้',
    sortOrder: 6,
    provinces: [
      { code: 'CHUMPHON',             name: 'Chumphon',             nameThai: 'ชุมพร' },
      { code: 'RANONG',               name: 'Ranong',               nameThai: 'ระนอง' },
      { code: 'SURAT_THANI',          name: 'Surat Thani',          nameThai: 'สุราษฎร์ธานี' },
      { code: 'PHANG_NGA',            name: 'Phang Nga',            nameThai: 'พังงา' },
      { code: 'PHUKET',               name: 'Phuket',               nameThai: 'ภูเก็ต' },
      { code: 'KRABI',                name: 'Krabi',                nameThai: 'กระบี่' },
      { code: 'NAKHON_SI_THAMMARAT',  name: 'Nakhon Si Thammarat',  nameThai: 'นครศรีธรรมราช' },
      { code: 'TRANG',                name: 'Trang',                nameThai: 'ตรัง' },
      { code: 'PHATTHALUNG',          name: 'Phatthalung',          nameThai: 'พัทลุง' },
      { code: 'SATUN',                name: 'Satun',                nameThai: 'สตูล' },
      { code: 'SONGKHLA',             name: 'Songkhla',             nameThai: 'สงขลา' },
      { code: 'PATTANI',              name: 'Pattani',              nameThai: 'ปัตตานี' },
      { code: 'YALA',                 name: 'Yala',                 nameThai: 'ยะลา' },
      { code: 'NARATHIWAT',           name: 'Narathiwat',           nameThai: 'นราธิวาส' },
    ],
  },
  {
    code: 'WEST',
    name: 'Western',
    nameThai: 'ภาคตะวันตก',
    sortOrder: 7,
    provinces: [
      { code: 'TAK',                 name: 'Tak',                 nameThai: 'ตาก' },
      { code: 'KANCHANABURI',        name: 'Kanchanaburi',        nameThai: 'กาญจนบุรี' },
      { code: 'RATCHABURI',          name: 'Ratchaburi',          nameThai: 'ราชบุรี' },
      { code: 'PHETCHABURI',         name: 'Phetchaburi',         nameThai: 'เพชรบุรี' },
      { code: 'PRACHUAP_KHIRI_KHAN', name: 'Prachuap Khiri Khan', nameThai: 'ประจวบคีรีขันธ์' },
    ],
  },
];

async function main() {
  console.log('🌱 Seeding regions and provinces...\n');

  let regionCount = 0;
  let provinceCount = 0;

  for (const r of REGIONS) {
    const region = await prisma.region.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        name: r.name,
        nameThai: r.nameThai,
        sortOrder: r.sortOrder,
      },
      update: {
        name: r.name,
        nameThai: r.nameThai,
        sortOrder: r.sortOrder,
      },
    });
    regionCount++;
    console.log(`  ✅ Region: ${region.code.padEnd(10)} ${region.nameThai}`);

    for (const p of r.provinces) {
      await prisma.province.upsert({
        where: { code: p.code },
        create: {
          code: p.code,
          name: p.name,
          nameThai: p.nameThai,
          regionId: region.id,
        },
        update: {
          name: p.name,
          nameThai: p.nameThai,
          regionId: region.id,
        },
      });
      provinceCount++;
    }
    console.log(`     ${r.provinces.length} provinces seeded\n`);
  }

  console.log(`\n✨ Done. ${regionCount} regions, ${provinceCount} provinces total.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
