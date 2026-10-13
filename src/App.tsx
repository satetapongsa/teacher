import { useState, useEffect, useMemo } from 'react';
import {
  type DistrictData,
  type MajorSubjectData,
  type LiveFeedItem,
  OFFICIAL_FEED,
} from './services/obecApi';
import {
  getDailyObecStatistics,
  startDailyAutoUpdateJob,
  type DailyUpdateRecord,
} from './services/dailySyncEngine';

// กำหนดการทางการ สพฐ. รอบทั่วไป 2569
const OFFICIAL_OPEN_DATE_STR = '19 ตุลาคม 2569 เวลา 08:30 น.';
const OFFICIAL_CLOSE_DATE_STR = '25 ตุลาคม 2569 เวลา 16:30 น.';
const OFFICIAL_PERIOD_LABEL = '19 – 25 ตุลาคม 2569';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'districts' | 'subjects' | 'feed'>('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('02:30 น.');
  const [lastSyncDate, setLastSyncDate] = useState(new Date().toISOString().slice(0, 10));

  // Data states from verified official records
  const [districts, setDistricts] = useState<DistrictData[]>([]);
  const [majors, setMajors] = useState<MajorSubjectData[]>([]);
  const [summary, setSummary] = useState<{
    totalApplicants: number | null;
    totalPositions: number | null;
    averageRatio: number | null;
    peakDistrict: string | null;
    peakRatio: number | null;
    statusText: string;
    updatedAt: string;
  }>({
    totalApplicants: null,
    totalPositions: null,
    averageRatio: null,
    peakDistrict: null,
    peakRatio: null,
    statusText: 'รอเปิดระบบรับสมัครอย่างเป็นทางการ วันที่ 19 ตุลาคม 2569 เวลา 08:30 น.',
    updatedAt: '02:30 น.',
  });

  // Filters & State
  const [searchDistrict, setSearchDistrict] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [feedItems] = useState<LiveFeedItem[]>(OFFICIAL_FEED);

  // ปักดาวเริ่มต้นให้ติดตามแค่ อุดรธานี และ กรุงเทพมหานคร ตามคำสั่ง
  const [watchlist, setWatchlist] = useState<string[]>([
    'spm-bkk-1', // สพม.กรุงเทพมหานคร เขต 1
    'spp-bkk',   // สพป.กรุงเทพมหานคร
    'spp-udon-1', // สพป.อุดรธานี เขต 1
    'spm-udon',  // สพม.อุดรธานี
  ]);

  // Real countdown timer based on actual system time
  const [nowTime, setNowTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // กำหนดการจริง: 19 ต.ค. 2569 08:30 น. - 25 ต.ค. 2569 16:30 น.
  // เดือนใน JavaScript Date: 9 = ตุลาคม (0-indexed)
  const openDate = useMemo(() => new Date(2026, 9, 19, 8, 30, 0), []);
  const closeDate = useMemo(() => new Date(2026, 9, 25, 16, 30, 0), []);

  const isRegistrationCurrentlyOpen = useMemo(() => {
    const currentMs = nowTime.getTime();
    return currentMs >= openDate.getTime() && currentMs <= closeDate.getTime();
  }, [nowTime, openDate, closeDate]);

  const countdownInfo = useMemo(() => {
    const currentMs = nowTime.getTime();
    const openMs = openDate.getTime();
    const closeMs = closeDate.getTime();

    if (currentMs < openMs) {
      // ก่อนวันเปิดรับสมัครจริง
      const diffSec = Math.max(0, Math.floor((openMs - currentMs) / 1000));
      const days = Math.floor(diffSec / 86400);
      const hours = Math.floor((diffSec % 86400) / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');

      return {
        status: 'before_open',
        title: 'นับถอยหลังเปิดรับสมัครออนไลน์ทางการ',
        targetDate: OFFICIAL_OPEN_DATE_STR,
        badge: 'รอเปิดรับสมัคร',
        display: `อีก ${days} วัน ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
      };
    } else if (currentMs <= closeMs) {
      // กำลังเปิดรับสมัครจริง
      const diffSec = Math.max(0, Math.floor((closeMs - currentMs) / 1000));
      const days = Math.floor(diffSec / 86400);
      const hours = Math.floor((diffSec % 86400) / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');

      return {
        status: 'open',
        title: 'ระบบกำลังเปิดรับสมัครออนไลน์ (นับถอยหลังปิดรับสมัคร)',
        targetDate: OFFICIAL_CLOSE_DATE_STR,
        badge: 'กำลังเปิดรับสมัครสด',
        display: `อีก ${days} วัน ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
      };
    } else {
      return {
        status: 'closed',
        title: 'ระบบปิดรับสมัครออนไลน์แล้ว',
        targetDate: OFFICIAL_CLOSE_DATE_STR,
        badge: 'สิ้นสุดการรับสมัคร',
        display: 'ปิดรับสมัครรอบทั่วไป 2569 แล้ว',
      };
    }
  }, [nowTime, openDate, closeDate]);

  // Handle data arrival from daily sync engine
  const handleDataSync = (record: DailyUpdateRecord) => {
    setDistricts(record.districts);
    setMajors(record.majors);
    setSummary({
      ...record.summary,
      updatedAt: record.lastSyncTimestamp,
    });
    setLastSyncTime(record.lastSyncTimestamp);
    setLastSyncDate(record.lastUpdatedDate);
  };

  // Start background auto update job
  useEffect(() => {
    const stopJob = startDailyAutoUpdateJob((freshRecord) => {
      handleDataSync(freshRecord);
    });
    return () => stopJob();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const record = await getDailyObecStatistics(true);
      handleDataSync(record);
    } catch (e) {
      console.error('Manual refresh error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleWatchlist = (districtId: string) => {
    setWatchlist((prev) =>
      prev.includes(districtId) ? prev.filter((id) => id !== districtId) : [...prev, districtId]
    );
  };

  const filteredDistricts = useMemo(() => {
    return districts.filter((d) => {
      const matchSearch =
        d.name.toLowerCase().includes(searchDistrict.toLowerCase()) ||
        d.province.toLowerCase().includes(searchDistrict.toLowerCase());
      const matchRegion = selectedRegion === 'all' || d.region === selectedRegion;
      return matchSearch && matchRegion;
    });
  }, [districts, searchDistrict, selectedRegion]);

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen pb-28 antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-sm border-b border-blue-100">
        <div className="flex justify-between items-center w-full px-4 py-3 max-w-screen-md mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <span className="material-symbols-outlined text-2xl" data-icon="analytics">analytics</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight flex items-center gap-1.5">
                สถิติครูผู้ช่วย 2569
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  สพฐ.
                </span>
              </h1>
              <span className="text-xs text-slate-500 block">สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Live Sync Pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <span className="text-xs font-semibold" title={`ตรวจสอบข้อมูล สพฐ. ประจำวัน: ${lastSyncDate}`}>
                {lastSyncTime}
              </span>
            </div>
            {/* Trailing Refresh button */}
            <button
              onClick={handleRefresh}
              aria-label="รีเฟรชข้อมูลล่าสุด"
              className="p-2 rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-all duration-150 border border-blue-200 shadow-xs"
              title="ดึงข้อมูลล่าสุดจาก สพฐ."
            >
              <span className={`material-symbols-outlined text-lg ${isRefreshing ? 'animate-spin' : ''}`} data-icon="sync">sync</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-screen-md mx-auto px-4 pt-4 space-y-4">
        {/* ================= VIEW 1: DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            {/* Hero Countdown & Official Notice Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-600 text-white p-5 shadow-lg shadow-blue-900/10 border border-blue-400/20">
              <div className="absolute -right-6 -bottom-8 opacity-15 pointer-events-none text-white">
                <span className="material-symbols-outlined text-9xl">school</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white backdrop-blur-md text-xs font-bold border border-white/20">
                  <span className="material-symbols-outlined text-sm" data-icon="campaign">campaign</span>
                  <span>ประกาศสถิติทางการ สพฐ. รอบทั่วไป 2569 ({OFFICIAL_PERIOD_LABEL})</span>
                </div>
                <span className="text-xs font-semibold text-blue-100 bg-blue-900/40 px-2.5 py-0.5 rounded-full border border-blue-300/20">
                  ออนไลน์ 08:30 – 16:30 น.
                </span>
              </div>

              {/* วันเปิดรับสมัครจริงเน้นชัดเจน */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20 mb-4">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                  <span className="material-symbols-outlined text-base">calendar_month</span>
                  <span>วันเปิดรับสมัครจริงอย่างเป็นทางการ:</span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-white mt-1">
                  {OFFICIAL_OPEN_DATE_STR} ถึง {OFFICIAL_CLOSE_DATE_STR}
                </div>
                <p className="text-xs text-blue-100 mt-0.5">
                  ระบบออนไลน์เปิดให้กรอกข้อมูลและส่งเอกสารได้ 24 ชั่วโมง (เริ่มต้นวันแรก 08:30 น. และสิ้นสุดวันสุดท้าย 16:30 น. ไม่เว้นวันหยุดราชการ)
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
                <div>
                  <p className="text-xs font-medium text-blue-200">
                    {countdownInfo.title}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-sm font-sans">
                      {countdownInfo.display}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold bg-amber-400 text-slate-900 px-3.5 py-1.5 rounded-xl shadow-md border border-amber-300">
                  <span className="material-symbols-outlined text-base">
                    {isRegistrationCurrentlyOpen ? 'lock_open' : 'schedule'}
                  </span>
                  <span>{countdownInfo.badge}</span>
                </div>
              </div>
            </div>

            {/* Status Advisory Card: แจ้งผู้สมัครตามจริง */}
            <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-sky-50/80 to-indigo-50/90 p-4 flex gap-3 items-start shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-xl">info</span>
              </div>
              <div className="text-xs space-y-1">
                <p className="font-bold text-blue-950 text-sm">
                  สถานะการซิงค์ข้อมูล สพฐ. แบบเรียลไทม์:
                </p>
                <p className="text-slate-700 leading-relaxed">
                  {isRegistrationCurrentlyOpen ? (
                    <span className="text-emerald-800 font-semibold">
                      ระบบรับสมัครสอบแข่งขันออนไลน์กำลังเปิดทำการ ระบบดึงยอดผู้สมัครสดและอัตราการแข่งขันจากระบบกลางอัตโนมัติ
                    </span>
                  ) : (
                    <span>
                      ก่อนถึงเวลาเปิดรับสมัครจริง (<strong>19 ต.ค. 2569 เวลา 08:30 น.</strong>) 
                      ระบบจะแสดงสถานะความพร้อมและโครงสร้างเขตพื้นที่จริง โดยไม่สร้างข้อมูลตัวเลขหลอก เมื่อถึงกำหนดเวลาเปิดรับสมัครจริง 
                      ระบบจะดึงข้อมูลการสมัครสดอัตโนมัติทันที
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Key Metric KPI Bento Grid (Colorful & Premium) */}
            <section aria-label="ตัวชี้วัดสำคัญระดับประเทศ" className="grid grid-cols-2 gap-3 sm:gap-4">
              {/* Metric 1: Total Applicants (Blue / Indigo) */}
              <article className="bg-gradient-to-br from-blue-50 to-indigo-50/80 rounded-2xl p-4 border border-blue-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between text-blue-900 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide">ผู้สมัครรวมทั่วประเทศ</span>
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="group">group</span>
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-blue-950 tracking-tight mt-1 font-sans">
                    {summary.totalApplicants !== null ? summary.totalApplicants.toLocaleString() : 'รอเปิดรับสมัคร'}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-700 font-medium">
                  <span className="material-symbols-outlined text-sm">event</span>
                  <span>เปิดจริง 19 ต.ค. 69 (08:30 น.)</span>
                </div>
              </article>

              {/* Metric 2: Total Positions (Emerald / Teal) */}
              <article className="bg-gradient-to-br from-emerald-50 to-teal-50/80 rounded-2xl p-4 border border-emerald-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between text-emerald-900 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide">ตำแหน่งเปิดรับทั้งหมด</span>
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="badge">badge</span>
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-950 tracking-tight mt-1 font-sans">
                    {summary.totalPositions !== null ? summary.totalPositions.toLocaleString() : 'รอประกาศทางการ'}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-emerald-800 font-medium">
                  <span>204 เขตพื้นที่ สพฐ.</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold border border-emerald-200">
                    รอบทั่วไป
                  </span>
                </div>
              </article>

              {/* Metric 3: Average Competition Ratio (Amber / Orange) */}
              <article className="bg-gradient-to-br from-amber-50 to-orange-50/80 rounded-2xl p-4 border border-amber-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between text-amber-950 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide">อัตราแข่งขันเฉลี่ย</span>
                    <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="balance">balance</span>
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-amber-950 tracking-tight mt-1 font-sans">
                    {summary.averageRatio !== null ? `1 : ${summary.averageRatio}` : 'ยังไม่มีข้อมูล'}
                  </div>
                </div>
                <div className="mt-3 text-xs text-amber-800 font-medium flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>คำนวณอัตโนมัติเมื่อเปิดรับสมัคร</span>
                </div>
              </article>

              {/* Metric 4: Peak Competition District (Violet / Purple) */}
              <article className="bg-gradient-to-br from-purple-50 to-fuchsia-50/80 rounded-2xl p-4 border border-purple-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between text-purple-950 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide">แข่งขันสูงสุด</span>
                    <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="local_fire_department">local_fire_department</span>
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-purple-950 tracking-tight mt-1 font-sans">
                    {summary.peakRatio !== null ? `1 : ${summary.peakRatio}` : 'ยังไม่มีข้อมูล'}
                  </div>
                </div>
                <div className="mt-3 text-xs text-purple-800 font-medium truncate">
                  {summary.peakDistrict ? summary.peakDistrict : 'ประมวลผลตามยอดจริง'}
                </div>
              </article>
            </section>

            {/* Official Schedule Timeline Section (ข้อมูลจริงที่ตรวจสอบได้) */}
            <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-700 text-xl" data-icon="event">event</span>
                    ปฏิทินการสอบแข่งขันครูผู้ช่วย 2569 (สพฐ. รอบทั่วไป)
                  </h2>
                  <p className="text-xs text-slate-500">กำหนดการอย่างเป็นทางการสำหรับผู้สมัครทั่วประเทศ</p>
                </div>
                <span className="text-xs font-bold bg-blue-100 text-blue-900 px-2.5 py-1 rounded-full border border-blue-200">
                  กำหนดการจริง
                </span>
              </div>

              <div className="space-y-3 pt-1">
                {[
                  {
                    date: 'ภายใน 12 ต.ค. 2569',
                    title: 'ประกาศรับสมัครสอบแข่งขัน',
                    desc: 'แต่ละ อ.ก.ค.ศ. เขตพื้นที่การศึกษาประกาศรายละเอียดตำแหน่งว่างและวิชาเอก',
                    done: true,
                    highlight: false,
                  },
                  {
                    date: '19 – 25 ต.ค. 2569',
                    title: 'รับสมัครสอบแข่งขันผ่านระบบออนไลน์ (วันเปิดรับสมัครจริง)',
                    desc: 'เปิดระบบ 19 ต.ค. เวลา 08:30 น. ถึง 25 ต.ค. เวลา 16:30 น. (ตลอด 24 ชั่วโมง ไม่เว้นวันหยุดราชการ)',
                    done: false,
                    highlight: true,
                    active: true,
                  },
                  {
                    date: 'ภายใน 28 ต.ค. 2569',
                    title: 'ประกาศรายชื่อผู้มีสิทธิ์สอบ ภาค ก และ ภาค ข',
                    desc: 'ตรวจสอบรายชื่อและสถานที่สอบตามเขตพื้นที่ที่สมัคร',
                    done: false,
                    highlight: false,
                  },
                  {
                    date: '14 พ.ย. 2569',
                    title: 'สอบข้อเขียน ภาค ก (ความรู้ความสามารถทั่วไป)',
                    desc: 'การสอบข้อเขียนภาคความรู้ความสามารถทั่วไปและกฎหมายการศึกษา',
                    done: false,
                    highlight: false,
                  },
                  {
                    date: '15 พ.ย. 2569',
                    title: 'สอบข้อเขียน ภาค ข (มาตรฐานวิชาชีพครู)',
                    desc: 'การสอบข้อเขียนความรู้ความสามารถเกี่ยวกับวิชาชีพและวิชาเอก',
                    done: false,
                    highlight: false,
                  },
                  {
                    date: 'ภายใน 18 พ.ย. 2569',
                    title: 'ประกาศผลผู้สอบผ่าน ภาค ก และ ภาค ข',
                    desc: 'ผู้ผ่านเกณฑ์มีสิทธิเข้ารับการประเมิน ภาค ค ต่อไป',
                    done: false,
                    highlight: false,
                  },
                ].map((step, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border transition-all ${
                      step.highlight
                        ? 'border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-xs ring-1 ring-blue-400/30'
                        : step.done
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-bold flex items-center gap-1.5 ${step.highlight ? 'text-blue-900' : step.done ? 'text-emerald-800' : 'text-slate-600'}`}>
                        <span className={`material-symbols-outlined text-base ${step.highlight ? 'text-blue-700' : step.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {step.done ? 'check_circle' : step.highlight ? 'pending_actions' : 'schedule'}
                        </span>
                        {step.date}
                      </span>
                      {step.highlight && (
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px] shadow-xs">
                          วันเปิดรับสมัครจริง
                        </span>
                      )}
                      {step.done && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                          เสร็จสิ้นแล้ว
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">{step.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ================= VIEW 2: DISTRICTS ================= */}
        {activeTab === 'districts' && (
          <div className="space-y-4">
            {/* Search Box */}
            <div className="flex items-center bg-white rounded-2xl border border-slate-200 px-3.5 py-2.5 gap-2.5 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <span className="material-symbols-outlined text-slate-400">search</span>
              <input
                type="text"
                className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
                placeholder="ค้นหาเขตพื้นที่ เช่น อุดรธานี, กรุงเทพมหานคร, เชียงใหม่..."
                value={searchDistrict}
                onChange={(e) => setSearchDistrict(e.target.value)}
              />
              {searchDistrict && (
                <button onClick={() => setSearchDistrict('')} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            {/* Region Filter Chips */}
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto py-1">
              {[
                { id: 'all', label: 'ทุกภูมิภาค' },
                { id: 'central', label: 'ภาคกลาง / กทม.' },
                { id: 'northeast', label: 'ภาคอีสาน (รวมอุดรธานี)' },
                { id: 'north', label: 'ภาคเหนือ' },
                { id: 'south', label: 'ภาคใต้' },
                { id: 'east', label: 'ภาคตะวันออก' },
                { id: 'west', label: 'ภาคตะวันตก' },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRegion(r.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    selectedRegion === r.id
                      ? 'bg-blue-700 text-white shadow-sm shadow-blue-500/20'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:text-blue-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* District List Card */}
            <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-700 text-xl">map</span>
                    รายชื่อเขตพื้นที่การศึกษา สพฐ. ({filteredDistricts.length} เขต)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    กำหนดการเปิดระบบ: <strong>{OFFICIAL_OPEN_DATE_STR}</strong> พร้อมกันทั่วประเทศ
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-semibold">
                  <span className="material-symbols-outlined text-sm text-amber-500">star</span>
                  <span>ติดตามแล้ว {watchlist.length} เขต</span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredDistricts.map((d) => {
                  const isSaved = watchlist.includes(d.id);
                  const isLive = d.status === 'open' && d.applicants !== null;
                  return (
                    <div key={d.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base">{d.name}</h3>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              d.type === 'สพม.' 
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                                : 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                            }`}>
                              {d.type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-slate-400">location_on</span>
                            จังหวัด {d.province}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleWatchlist(d.id)}
                            className={`p-1.5 rounded-xl transition-all ${
                              isSaved 
                                ? 'bg-amber-50 text-amber-500 border border-amber-300 shadow-xs' 
                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-50'
                            }`}
                            title={isSaved ? 'อยู่ในรายการติดตาม (ปักดาวแล้ว)' : 'ปักดาวเพื่อติดตาม'}
                          >
                            <span className={`material-symbols-outlined text-xl ${isSaved ? 'filled' : ''}`}>
                              {isSaved ? 'star' : 'star_outline'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Dynamic Live Data vs Pending Registration */}
                      {isLive ? (
                        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl px-3.5 py-2 mt-2.5 text-xs">
                          <span className="flex items-center gap-1.5 font-bold text-emerald-900">
                            <span className="material-symbols-outlined text-emerald-600 text-base">how_to_reg</span>
                            ผู้สมัคร: {d.applicants?.toLocaleString()} คน ({d.positions} ตำแหน่ง)
                          </span>
                          <span className="font-extrabold text-emerald-800 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-200 shadow-xs">
                            อัตราแข่งขัน 1 : {d.ratio}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-blue-50/70 border border-blue-100 rounded-xl px-3.5 py-2 mt-2.5 text-xs text-slate-700">
                          <span className="flex items-center gap-1 text-slate-600">
                            <span className="material-symbols-outlined text-xs text-blue-600">event</span>
                            เปิดรับสมัครจริง: {OFFICIAL_OPEN_DATE_STR}
                          </span>
                          <span className="text-[11px] font-bold text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded-lg border border-blue-200">
                            รอเปิดระบบดึงข้อมูล
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ================= VIEW 3: SUBJECTS ================= */}
        {activeTab === 'subjects' && (
          <div className="space-y-4">
            <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-700 text-xl">school</span>
                    กลุ่มสาขาวิชาเอกหลักในการสอบครูผู้ช่วย สพฐ.
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    โครงสร้างวิชาเอกตามประกาศเกณฑ์การสอบแข่งขันรอบทั่วไป ปี 2569
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-900 text-xs font-bold border border-blue-200">
                  รอบทั่วไป 2569
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {majors.map((m, idx) => {
                  const isAnnounced = m.status === 'announced' && m.applicants !== null;
                  return (
                    <div key={m.id} className="py-3.5 flex items-center justify-between gap-2 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-blue-600 bg-blue-50 w-7 h-7 rounded-lg flex items-center justify-center border border-blue-200">
                          {idx + 1}
                        </span>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">{m.name}</h3>
                          <p className="text-xs text-slate-500">กลุ่มสาระ: {m.category}</p>
                        </div>
                      </div>
                      <div>
                        {isAnnounced ? (
                          <div className="text-right">
                            <span className="text-xs font-bold text-emerald-800 block">
                              ผู้สมัคร {m.applicants?.toLocaleString()} คน
                            </span>
                            <span className="text-[10px] text-slate-500 font-semibold">
                              อัตราแข่งขัน 1 : {m.ratio}
                            </span>
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                            เปิด 19 ต.ค. 69
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ================= VIEW 4: LIVE FEED & WATCHLIST ================= */}
        {activeTab === 'feed' && (
          <div className="space-y-4">
            {/* Watchlist Section (อุดรธานี & กรุงเทพมหานคร เริ่มต้น) */}
            <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 filled text-xl">star</span>
                  เขตพื้นที่ในรายการติดตาม ({watchlist.length})
                </h2>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  ปักดาวเริ่มต้น: อุดรฯ & กทม.
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                ระบบจะแจ้งเตือนและดึงสถิติจำนวนผู้สมัครของเขตเหล่านี้โดยตรงทันทีเมื่อระบบเปิดรับสมัคร
              </p>

              <div className="space-y-2.5">
                {watchlist.map((wid) => {
                  const item = districts.find((d) => d.id === wid);
                  if (!item) return null;
                  const isLive = item.status === 'open' && item.applicants !== null;
                  return (
                    <div
                      key={wid}
                      className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-50/60 to-orange-50/40 border border-amber-200 text-xs shadow-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm block">{item.name}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-800 border border-amber-200">
                            {item.type}
                          </span>
                        </div>
                        <span className="text-slate-600 block">
                          จังหวัด {item.province} • {isLive ? `ผู้สมัคร: ${item.applicants?.toLocaleString()} คน (อัตรา 1:${item.ratio})` : `เปิดรับสมัคร: ${OFFICIAL_OPEN_DATE_STR}`}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleWatchlist(wid)}
                        className="text-rose-600 font-bold hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-all border border-rose-200 text-xs"
                      >
                        ยกเลิกติดตาม
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Official Announcement Feed */}
            <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-blue-700 text-xl">notifications_active</span>
                ประกาศและสถานะทางการ (สพฐ.)
              </h2>
              <p className="text-xs text-slate-500 mb-4">รวบรวมประกาศอย่างเป็นทางการที่ผ่านการตรวจสอบแล้ว</p>

              <div className="space-y-3">
                {feedItems.map((feed) => (
                  <div key={feed.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition-all">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">schedule</span>
                        {feed.timestamp}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold text-[10px] border border-blue-200">
                        {feed.source}
                      </span>
                    </div>
                    <h3 className="font-bold text-blue-950 text-sm">{feed.title}</h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{feed.message}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Global Bottom Navigation Bar */}
      <nav aria-label="แถบการนำทางหลัก" className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-3 py-2 max-w-screen-md mx-auto bg-white/95 backdrop-blur-md shadow-lg border-t border-slate-200">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'dashboard'
              ? 'bg-gradient-to-r from-blue-700 to-indigo-700 text-white font-bold shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-blue-700 hover:bg-slate-100'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="dashboard">dashboard</span>
          <span className="text-[11px] font-semibold mt-0.5">ภาพรวม</span>
        </button>

        <button
          onClick={() => setActiveTab('districts')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'districts'
              ? 'bg-gradient-to-r from-blue-700 to-indigo-700 text-white font-bold shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-blue-700 hover:bg-slate-100'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="map">map</span>
          <span className="text-[11px] font-semibold mt-0.5">เขตพื้นที่</span>
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'subjects'
              ? 'bg-gradient-to-r from-blue-700 to-indigo-700 text-white font-bold shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-blue-700 hover:bg-slate-100'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="school">school</span>
          <span className="text-[11px] font-semibold mt-0.5">วิชาเอก</span>
        </button>

        <button
          onClick={() => setActiveTab('feed')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'feed'
              ? 'bg-gradient-to-r from-blue-700 to-indigo-700 text-white font-bold shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-blue-700 hover:bg-slate-100'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="star">star</span>
          <span className="text-[11px] font-semibold mt-0.5">ติดตาม / ประกาศ</span>
        </button>
      </nav>
    </div>
  );
}
