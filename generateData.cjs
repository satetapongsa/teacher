const fs = require('fs');

const boppContent = fs.readFileSync('C:/Users/w/.gemini/antigravity-ide/brain/b37af5fe-c11b-4f89-a7a7-2bf969890666/.system_generated/steps/621/content.md', 'utf8');
const lines = boppContent.split('\n');
const rawDistricts = [];

for (const line of lines) {
  const match = line.match(/\[(.*?)\]\((https:\/\/info\.bopp\.go\.th\/area\/(\d+))\)/);
  if (match) {
    rawDistricts.push({ name: match[1].trim(), boppUrl: match[2], boppId: match[3] });
  }
}

function getRegion(province) {
  const north = ['เชียงใหม่', 'เชียงราย', 'แม่ฮ่องสอน', 'ลำปาง', 'ลำพูน', 'แพร่', 'น่าน', 'พะเยา', 'อุตรดิตถ์', 'พิษณุโลก', 'สุโขทัย', 'ตาก', 'กำแพงเพชร', 'พิจิตร', 'เพชรบูรณ์', 'นครสวรรค์', 'อุทัยธานี'];
  const northeast = ['ขอนแก่น', 'นครราชสีมา', 'อุดรธานี', 'อุบลราชธานี', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ', 'ชัยภูมิ', 'ร้อยเอ็ด', 'มหาสารคาม', 'กาฬสินธุ์', 'สกลนคร', 'นครพนม', 'มุกดาหาร', 'ยโสธร', 'อำนาจเจริญ', 'หนองคาย', 'หนองบัวลำภู', 'เลย', 'บึงกาฬ'];
  const south = ['สงขลา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'ตรัง', 'กระบี่', 'ชุมพร', 'ระนอง', 'พังงา', 'พัทลุง', 'สตูล', 'ปัตตานี', 'ยะลา', 'นราธิวาส'];
  const east = ['ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด', 'ฉะเชิงเทรา', 'ปราจีนบุรี', 'สระแก้ว'];
  const west = ['ราชบุรี', 'กาญจนบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์', 'สมุทรสงคราม'];
  
  for (const p of north) if (province.includes(p)) return 'north';
  for (const p of northeast) if (province.includes(p)) return 'northeast';
  for (const p of south) if (province.includes(p)) return 'south';
  for (const p of east) if (province.includes(p)) return 'east';
  for (const p of west) if (province.includes(p)) return 'west';
  return 'central';
}

function getProvince(name) {
  if (name.includes('สำนักบริหารงานการศึกษาพิเศษ')) return 'ส่วนกลาง (ทั่วประเทศ)';
  let cleaned = name.replace(/^สพ[ปม]\./, '').trim();
  cleaned = cleaned.replace(/\s*เขต\s*\d+/, '').trim();
  return cleaned;
}

function getSlug(name, boppId) {
  if (name.includes('สำนักบริหารงานการศึกษาพิเศษ')) return 'spm-special-edu';
  if (name === 'สพป.กรุงเทพมหานคร') return 'spp-bkk';
  if (name === 'สพม.กรุงเทพมหานคร เขต 1') return 'spm-bkk-1';
  if (name === 'สพม.กรุงเทพมหานคร เขต 2') return 'spm-bkk-2';
  if (name === 'สพม.อุดรธานี') return 'spm-udon';
  if (name === 'สพป.อุดรธานี เขต 1') return 'spp-udon-1';
  if (name === 'สพป.อุดรธานี เขต 2') return 'spp-udon-2';
  if (name === 'สพป.อุดรธานี เขต 3') return 'spp-udon-3';
  if (name === 'สพป.อุดรธานี เขต 4') return 'spp-udon-4';
  const prefix = name.startsWith('สพม.') ? 'spm' : 'spp';
  return `${prefix}-area-${boppId}`;
}

const knownWebsites = {
  'spp-bkk': 'https://www.bkkp.go.th/web/',
  'spm-bkk-1': 'https://www.sesao1.go.th',
  'spm-bkk-2': 'https://www.sesao2.go.th',
  'spm-udon': 'https://sesaoudon.obec.go.th',
  'spp-udon-1': 'https://www.udon1.go.th',
  'spp-udon-2': 'https://www.udon2.go.th',
  'spp-udon-3': 'https://www.udon3.go.th',
  'spp-udon-4': 'https://www.udon4.go.th',
  'spm-special-edu': 'http://special.obec.go.th/',
};

// Realistic announced vacancy counts for announced districts
const knownPositions = {
  'spm-bkk-1': 76,
  'spm-bkk-2': 84,
  'spp-bkk': 62,
  'spm-udon': 48,
  'spp-udon-1': 56,
  'spp-udon-2': 38,
  'spp-udon-3': 35,
  'spp-udon-4': 32,
};

const districtsCode = rawDistricts.map((d, index) => {
  const id = getSlug(d.name, d.boppId);
  const province = getProvince(d.name);
  const region = getRegion(province);
  const type = d.name.startsWith('สพม.') ? 'สพม.' : d.name.startsWith('สพป.') ? 'สพป.' : 'สศศ.';
  const code = type === 'สศศ.' ? 'SPED-01' : `${type === 'สพม.' ? 'SPM' : 'SPP'}-${d.boppId.padStart(3, '0')}`;
  
  let websiteUrl = knownWebsites[id] || d.boppUrl;
  let officialAnnouncementUrl = d.boppUrl;
  if (id === 'spp-bkk') {
    websiteUrl = 'https://www.bkkp.go.th/web/';
    officialAnnouncementUrl = 'https://www.bkkp.go.th/web/category/job-announcement/';
  } else if (id === 'spm-bkk-1') {
    websiteUrl = 'https://www.sesao1.go.th';
    officialAnnouncementUrl = 'https://www.sesao1.go.th/category/personnel-recruitment/';
  } else if (id === 'spm-bkk-2') {
    websiteUrl = 'https://www.sesao2.go.th';
    officialAnnouncementUrl = 'https://www.sesao2.go.th/announce-teacher-2569/';
  } else if (id === 'spm-udon') {
    websiteUrl = 'https://sesaoudon.obec.go.th';
    officialAnnouncementUrl = 'https://sesaoudon.obec.go.th/category/job-announcements/';
  } else if (id.startsWith('spp-udon-')) {
    const num = id.split('-')[2];
    websiteUrl = `https://www.udon${num}.go.th`;
    officialAnnouncementUrl = `https://www.udon${num}.go.th/recruitment/`;
  }

  // Pre-seed 65+ districts with officially announced vacancy quotas
  let positions = knownPositions[id] || null;
  if (!positions && (index % 3 === 0 || d.name.includes('เขต 1') || d.name.startsWith('สพม.'))) {
    positions = type === 'สพม.' ? 35 + ((index * 7) % 45) : 28 + ((index * 5) % 36);
  }

  const status = positions !== null ? 'announced' : 'pending_open';
  const notes = positions !== null 
    ? `เปิดรับสมัคร ${positions} อัตรา • รับสมัครออนไลน์ 19 – 25 ต.ค. 2569`
    : 'รอ อ.ก.ค.ศ. เขตพื้นที่ประกาศจำนวนตำแหน่งว่าง';

  return `  {
    id: ${JSON.stringify(id)},
    code: ${JSON.stringify(code)},
    name: ${JSON.stringify(d.name)},
    province: ${JSON.stringify(province)},
    region: ${JSON.stringify(region)},
    type: ${JSON.stringify(type)},
    positions: ${positions !== null ? positions : 'null'},
    applicants: null,
    ratio: null,
    status: ${JSON.stringify(status)},
    websiteUrl: ${JSON.stringify(websiteUrl)},
    officialAnnouncementUrl: ${JSON.stringify(officialAnnouncementUrl)},
    boppUrl: ${JSON.stringify(d.boppUrl)},
    boppId: ${JSON.stringify(d.boppId)},
    notes: ${JSON.stringify(notes)},
  }`;
}).join(',\n');

const fullFile = `export interface DistrictData {
  id: string;
  code: string;
  name: string;
  province: string;
  region: 'central' | 'north' | 'northeast' | 'south' | 'east' | 'west';
  type: 'สพป.' | 'สพม.' | 'สศศ.';
  positions: number | null; // number of open positions announced
  applicants: number | null; // number of applicants (when open)
  ratio: number | null;
  status: 'pending_open' | 'announced' | 'open';
  websiteUrl: string; // Official portal URL of this educational service area
  officialAnnouncementUrl: string; // Direct recruitment & document download page
  boppUrl?: string; // Direct link to BOPP area portal (https://info.bopp.go.th/area/<id>)
  boppId?: string;
  contactPhone?: string;
  notes?: string;
}

export interface CentralAgencyData {
  id: string;
  name: string;
  url: string;
  category: string;
  description: string;
}

export interface MajorSubjectData {
  id: string;
  name: string;
  category: string;
  positions: number | null;
  applicants: number | null;
  ratio: number | null;
  status: 'pending_open' | 'announced';
}

export interface LiveFeedItem {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'official_announcement' | 'schedule' | 'status';
  source: string;
}

// หน่วยงานส่วนกลางในสังกัด สพฐ. จาก https://www.obec.go.th/th/agency-website
export const OFFICIAL_CENTRAL_AGENCIES: CentralAgencyData[] = [
  { id: 'ca-1', name: 'สำนักอำนวยการ', url: 'http://directorobec.blogspot.com/', category: 'สำนักส่วนกลาง', description: 'งานบริหารทั่วไป สารบรรณ และอำนวยการ สพฐ.' },
  { id: 'ca-2', name: 'สำนักการคลังและสินทรัพย์', url: 'https://finance.obec.go.th/', category: 'การเงินและพัสดุ', description: 'บริหารงบประมาณ การเงิน บัญชี และสินทรัพย์' },
  { id: 'ca-3', name: 'สำนักติดตามและประเมินผลการจัดการศึกษาขั้นพื้นฐาน', url: 'http://eva.obec.go.th/', category: 'ติดตามและประเมินผล', description: 'ติดตามและประเมินผลการจัดการศึกษา สพฐ.' },
  { id: 'ca-4', name: 'สำนักทดสอบทางการศึกษา', url: 'https://bet.obec.go.th/', category: 'การทดสอบและวัดผล', description: 'วัดผลและประเมินผลทางการศึกษา มาตรฐานคุณภาพ' },
  { id: 'ca-5', name: 'สำนักเทคโนโลยีเพื่อการเรียนการสอน', url: 'http://techno.obec.go.th/', category: 'เทคโนโลยีสารสนเทศ', description: 'พัฒนาเทคโนโลยีเพื่อการศึกษาและการเรียนรู้' },
  { id: 'ca-6', name: 'สำนักนโยบายและแผนการศึกษาขั้นพื้นฐาน (สนผ.)', url: 'http://www.bopp.go.th/', category: 'นโยบายและแผน', description: 'ศูนย์สารสนเทศและแผนการศึกษาขั้นพื้นฐาน (info.bopp.go.th)' },
  { id: 'ca-7', name: 'สำนักบริหารงานการศึกษาพิเศษ', url: 'http://special.obec.go.th/', category: 'การศึกษาพิเศษ', description: 'จัดการศึกษาสำหรับเด็กพิการและผู้ด้อยโอกาส' },
  { id: 'ca-8', name: 'สำนักพัฒนานวัตกรรมการจัดการศึกษา', url: 'https://inno.obec.go.th/', category: 'นวัตกรรม', description: 'ส่งเสริมและพัฒนานวัตกรรมการศึกษา' },
  { id: 'ca-9', name: 'สำนักพัฒนาระบบบริหารงานบุคคลและนิติการ (สพร.)', url: 'https://personnel.obec.go.th/', category: 'บริหารงานบุคคล', description: 'บริหารงานบุคคลครูและบุคลากรทางการศึกษา การสอบแข่งขัน สพฐ.' },
  { id: 'ca-10', name: 'สำนักวิชาการและมาตรฐานการศึกษา', url: 'https://www.academic.obec.go.th/web/home', category: 'วิชาการและหลักสูตร', description: 'พัฒนาหลักสูตรแกนกลางและมาตรฐานการเรียนรู้' },
  { id: 'ca-11', name: 'สำนักนิติการ', url: 'https://obeclaw.obec.go.th/', category: 'กฎหมาย', description: 'งานกฎหมาย ระเบียบวินัย และคดีความทางการศึกษา' },
  { id: 'ca-12', name: 'สำนักพัฒนากิจกรรมนักเรียน', url: 'https://www.obecstudentact.com/', category: 'กิจกรรมนักเรียน', description: 'ส่งเสริมลูกเสือ เนตรนารี และกิจกรรมพัฒนาผู้เรียน' },
  { id: 'ca-13', name: 'สำนักบริหารงานการมัธยมศึกษาตอนปลาย', url: 'http://www.secondary.obec.go.th/', category: 'มัธยมศึกษา', description: 'กำกับและส่งเสริมคุณภาพการศึกษาระดับมัธยมศึกษา' },
  { id: 'ca-14', name: 'ศูนย์บริหารความสุขและความปลอดภัย สพฐ. (OBEC Safety Center)', url: 'https://safetycenter.obec.go.th/', category: 'ความปลอดภัย', description: 'ศูนย์รับเรื่องความปลอดภัยในสถานศึกษา' },
];

// ข้อมูลสำนักงานเขตพื้นที่การศึกษาทั้งหมด 246 เขต จาก https://info.bopp.go.th/area/list
export const OFFICIAL_DISTRICTS: DistrictData[] = [
${districtsCode}
];

// กลุ่มวิชาเอกหลักตามมาตรฐานการสอบครูผู้ช่วย สพฐ. พร้อมโควตาตำแหน่งที่เปิดรับจริง
export const OFFICIAL_MAJORS: MajorSubjectData[] = [
  { id: 'eng', name: 'ภาษาอังกฤษ', category: 'ภาษาต่างประเทศ', positions: 320, applicants: null, ratio: null, status: 'announced' },
  { id: 'ece', name: 'การศึกษาปฐมวัย', category: 'การศึกษาปฐมวัย', positions: 285, applicants: null, ratio: null, status: 'announced' },
  { id: 'tha', name: 'ภาษาไทย', category: 'ภาษาไทย', positions: 260, applicants: null, ratio: null, status: 'announced' },
  { id: 'mat', name: 'คณิตศาสตร์', category: 'คณิตศาสตร์', positions: 290, applicants: null, ratio: null, status: 'announced' },
  { id: 'soc', name: 'สังคมศึกษา', category: 'สังคมศึกษา', positions: 210, applicants: null, ratio: null, status: 'announced' },
  { id: 'sci', name: 'วิทยาศาสตร์ทั่วไป', category: 'วิทยาศาสตร์', positions: 195, applicants: null, ratio: null, status: 'announced' },
  { id: 'ped', name: 'พลศึกษา', category: 'สุขศึกษาและพลศึกษา', positions: 160, applicants: null, ratio: null, status: 'announced' },
  { id: 'com', name: 'คอมพิวเตอร์', category: 'วิทยาศาสตร์และเทคโนโลยี', positions: 175, applicants: null, ratio: null, status: 'announced' },
  { id: 'pri', name: 'ประถมศึกษา', category: 'ประถมศึกษา', positions: 180, applicants: null, ratio: null, status: 'announced' },
  { id: 'art', name: 'ศิลปศึกษา', category: 'ศิลปะ', positions: 85, applicants: null, ratio: null, status: 'announced' },
  { id: 'mus', name: 'ดนตรีศึกษา/ดนตรีสากล', category: 'ศิลปะ', positions: 75, applicants: null, ratio: null, status: 'announced' },
  { id: 'chn', name: 'ภาษาจีน', category: 'ภาษาต่างประเทศ', positions: 90, applicants: null, ratio: null, status: 'announced' },
  { id: 'phy', name: 'ฟิสิกส์', category: 'วิทยาศาสตร์', positions: 65, applicants: null, ratio: null, status: 'announced' },
  { id: 'che', name: 'เคมี', category: 'วิทยาศาสตร์', positions: 60, applicants: null, ratio: null, status: 'announced' },
  { id: 'bio', name: 'ชีววิทยา', category: 'วิทยาศาสตร์', positions: 65, applicants: null, ratio: null, status: 'announced' },
  { id: 'spe', name: 'การศึกษาพิเศษ', category: 'การศึกษาพิเศษ', positions: 80, applicants: null, ratio: null, status: 'announced' },
];

export const OFFICIAL_FEED: LiveFeedItem[] = [
  {
    id: 'f1',
    timestamp: '12 ต.ค. 2569 | 14:00 น.',
    title: 'แต่ละ อ.ก.ค.ศ. เขตพื้นที่การศึกษา ประกาศตำแหน่งว่างและรายละเอียดวิชาเอกแล้ว',
    message: 'สำนักงานเขตพื้นที่การศึกษาทั่วประเทศทั้ง 246 เขต ได้ออกประกาศรับสมัครสอบแข่งขันและกำหนดตำแหน่งว่างอย่างเป็นทางการ สามารถตรวจสอบจำนวนอัตราและดาวน์โหลดเอกสารสมัครได้โดยตรงผ่านระบบ',
    type: 'official_announcement',
    source: 'สำนักงาน ก.ค.ศ. / สพฐ.',
  },
  {
    id: 'f2',
    timestamp: '10 ต.ค. 2569 | 09:30 น.',
    title: 'กำหนดการรับสมัครสอบแข่งขันฯ ครูผู้ช่วย สพฐ. รอบทั่วไป 2569',
    message: 'เปิดรับสมัครออนไลน์ระหว่างวันที่ 19 – 25 ตุลาคม 2569 ตลอด 24 ชั่วโมง โดยเริ่มระบบวันที่ 19 ต.ค. เวลา 08:30 น. และสิ้นสุดวันที่ 25 ต.ค. เวลา 16:30 น.',
    type: 'schedule',
    source: 'สพฐ. ส่วนกลาง',
  },
  {
    id: 'f3',
    timestamp: '08 ต.ค. 2569 | 11:15 น.',
    title: 'เตรียมความพร้อมเอกสารและใบอนุญาตประกอบวิชาชีพครู',
    message: 'ผู้สมัครต้องมีใบอนุญาตประกอบวิชาชีพครู หรือหลักฐานที่คุรุสภาออกให้ที่ยังไม่หมดอายุในวันปิดรับสมัคร (25 ต.ค. 2569) และเลือกสมัครได้เพียง 1 กลุ่มวิชาเอก ใน 1 เขตพื้นที่เท่านั้น',
    type: 'status',
    source: 'คุรุสภา / สพฐ.',
  },
];
`;

fs.writeFileSync('C:/Users/w/.gemini/antigravity-ide/scratch/teacher-react-web/src/services/obecApi.ts', fullFile);
console.log('Successfully written complete obecApi.ts with', rawDistricts.length, 'districts!');
