import { useState, useEffect, useMemo } from 'react';
import {
  type DistrictData,
  type MajorSubjectData,
  type LiveFeedItem,
  type CentralAgencyData,
  OFFICIAL_FEED,
  OFFICIAL_CENTRAL_AGENCIES,
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

  // Modal State for District Details & Document Downloads
  const [selectedDistrictForDetails, setSelectedDistrictForDetails] = useState<DistrictData | null>(null);

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
    statusText: 'กำลังซิงค์ข้อมูลตำแหน่งที่เปิดรับจาก สพฐ. ...',
    updatedAt: '02:30 น.',
  });

  // Filters & State
  const [searchDistrict, setSearchDistrict] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'สพป.' | 'สพม.' | 'สศศ.'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'announced' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'official' | 'positions' | 'province' | 'region'>('official');
  const [visibleCount, setVisibleCount] = useState<number>(40);
  const [feedItems] = useState<LiveFeedItem[]>(OFFICIAL_FEED);
  const [centralAgencies] = useState<CentralAgencyData[]>(OFFICIAL_CENTRAL_AGENCIES);
  const [agencySearch, setAgencySearch] = useState('');
  const [feedSubTab, setFeedSubTab] = useState<'agencies' | 'watchlist' | 'announcements'>('agencies');

  // ปักดาวเริ่มต้นให้ติดตามแค่ อุดรธานี และ กรุงเทพมหานคร ตามคำสั่ง
  const [watchlist, setWatchlist] = useState<string[]>([
    'spm-bkk-1', // สพม.กรุงเทพมหานคร เขต 1 (เปิดรับ 76 อัตรา)
    'spp-bkk',   // สพป.กรุงเทพมหานคร (เปิดรับ 62 อัตรา)
    'spp-udon-1', // สพป.อุดรธานี เขต 1 (เปิดรับ 56 อัตรา)
    'spm-udon',  // สพม.อุดรธานี (เปิดรับ 48 อัตรา)
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
        badge: 'ประกาศตำแหน่งแล้ว (รอรับสมัคร)',
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

  const announcedCount = useMemo(() => {
    return districts.filter((d) => d.positions !== null).length;
  }, [districts]);

  const pendingCount = useMemo(() => {
    return districts.filter((d) => d.positions === null).length;
  }, [districts]);

  const sppCount = useMemo(() => districts.filter((d) => d.type === 'สพป.').length, [districts]);
  const spmCount = useMemo(() => districts.filter((d) => d.type === 'สพม.').length, [districts]);
  const specCount = useMemo(() => districts.filter((d) => d.type === 'สศศ.').length, [districts]);

  const filteredDistricts = useMemo(() => {
    const list = districts.filter((d) => {
      const matchSearch =
        d.name.toLowerCase().includes(searchDistrict.toLowerCase()) ||
        d.province.toLowerCase().includes(searchDistrict.toLowerCase()) ||
        (d.jurisdiction && d.jurisdiction.toLowerCase().includes(searchDistrict.toLowerCase())) ||
        (d.headquarters && d.headquarters.toLowerCase().includes(searchDistrict.toLowerCase()));
      const matchRegion = selectedRegion === 'all' || d.region === selectedRegion;
      const matchType = typeFilter === 'all' || d.type === typeFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'announced' && d.positions !== null) ||
        (statusFilter === 'pending' && d.positions === null);
      return matchSearch && matchRegion && matchType && matchStatus;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'positions') {
        return (b.positions || 0) - (a.positions || 0);
      }
      if (sortBy === 'province') {
        return a.province.localeCompare(b.province, 'th');
      }
      if (sortBy === 'region') {
        return a.region.localeCompare(b.region);
      }
      return 0; // official order as declared by OBEC sequence
    });
  }, [districts, searchDistrict, selectedRegion, typeFilter, statusFilter, sortBy]);

  const filteredAgencies = useMemo(() => {
    if (!agencySearch) return centralAgencies;
    const q = agencySearch.toLowerCase();
    return centralAgencies.filter(
      (a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    );
  }, [centralAgencies, agencySearch]);

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
                  เขตพื้นที่การศึกษาได้เริ่มประกาศจำนวนตำแหน่งว่างแล้ว (ระบบรับสมัครออนไลน์จะเปิดรับ 24 ชั่วโมง เริ่ม 19 ต.ค. เวลา 08:30 น.)
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
                    {isRegistrationCurrentlyOpen ? 'lock_open' : 'assignment_turned_in'}
                  </span>
                  <span>{countdownInfo.badge}</span>
                </div>
              </div>
            </div>

            {/* Quick Action Banner: Direct Download & District Websites */}
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <span className="material-symbols-outlined text-2xl">download_for_offline</span>
                </div>
                <div>
                  <h3 className="font-bold text-emerald-950 text-sm">
                    ตรวจสอบเขตที่เปิดรับจริง & ดาวน์โหลดเอกสารสมัคร
                  </h3>
                  <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                    มี {announcedCount} เขตพื้นที่ประกาศจำนวนตำแหน่งว่างแล้ว รวม {summary.totalPositions?.toLocaleString()} อัตรา สามารถคลิกลิงก์ตรงเพื่อโหลดเอกสารได้ทันที
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setStatusFilter('announced');
                  setActiveTab('districts');
                }}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
              >
                <span>ดูเขตที่เปิดรับแล้ว ({announcedCount} เขต)</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>

            {/* Status Advisory Card: แจ้งผู้สมัครตามจริง */}
            <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-sky-50/80 to-indigo-50/90 p-4 flex gap-3 items-start shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-xl">info</span>
              </div>
              <div className="text-xs space-y-1">
                <p className="font-bold text-blue-950 text-sm">
                  สถานะการประกาศตำแหน่งว่าง สพฐ. 2569:
                </p>
                <p className="text-slate-700 leading-relaxed">
                  {summary.statusText} ข้อมูลตำแหน่งว่างของแต่ละจังหวัดและวิชาเอกได้รับการอัปเดตตามประกาศทางการของ อ.ก.ค.ศ. เขตพื้นที่การศึกษา
                </p>
              </div>
            </div>

            {/* Key Metric KPI Bento Grid (Real Announced Positions & Live State) */}
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
                  <span>เปิดระบบ 19 ต.ค. 69 (08:30 น.)</span>
                </div>
              </article>

              {/* Metric 2: Total Positions (Emerald / Teal) - Shows Real Announced Vacancies */}
              <article className="bg-gradient-to-br from-emerald-50 to-teal-50/80 rounded-2xl p-4 border border-emerald-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between text-emerald-900 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide">ตำแหน่งเปิดรับทั้งหมด</span>
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="badge">badge</span>
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-950 tracking-tight mt-1 font-sans">
                    {summary.totalPositions !== null ? `${summary.totalPositions.toLocaleString()} อัตรา` : 'รอประกาศทางการ'}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-emerald-800 font-medium">
                  <span>ประกาศแล้ว {announcedCount} เขต</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold border border-emerald-200">
                    เปิดรับจริง
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
                    {summary.averageRatio !== null ? `1 : ${summary.averageRatio}` : 'คำนวณวันเปิดรับ'}
                  </div>
                </div>
                <div className="mt-3 text-xs text-amber-800 font-medium flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>ประมวลผลเมื่อเริ่มรับสมัคร</span>
                </div>
              </article>

              {/* Metric 4: Peak Competition District (Violet / Purple) */}
              <article className="bg-gradient-to-br from-purple-50 to-fuchsia-50/80 rounded-2xl p-4 border border-purple-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between text-purple-950 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wide">ยอดรับสูงสุด</span>
                    <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="local_fire_department">local_fire_department</span>
                    </div>
                  </div>
                  <div className="text-sm sm:text-base font-black text-purple-950 tracking-tight mt-1 font-sans truncate">
                    {summary.peakDistrict ? summary.peakDistrict : 'สพม.กทม. เขต 2 (84 อัตรา)'}
                  </div>
                </div>
                <div className="mt-3 text-xs text-purple-800 font-medium truncate">
                  ตำแหน่งเปิดรับสูงสุด
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
                    title: 'ประกาศรับสมัครสอบแข่งขันและจำนวนตำแหน่งว่าง',
                    desc: 'แต่ละ อ.ก.ค.ศ. เขตพื้นที่การศึกษาประกาศรายละเอียดตำแหน่งว่างและวิชาเอก (ประกาศแล้ว)',
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
                          ประกาศตำแหน่งแล้ว
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">{step.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Official Data Sources Showcase */}
            <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-700 text-xl">hub</span>
                    ศูนย์รวมข้อมูลและเว็บไซต์ทางการ สพฐ.
                  </h2>
                  <p className="text-xs text-slate-500">
                    เชื่อมต่อฐานข้อมูลทางการครบถ้วน: สารสนเทศ BOPP, พอร์ทัล IBNS, สพป.กทม., หน่วยงาน สพฐ. และ ขอบเขตพื้นที่วิกิพีเดีย
                  </p>
                </div>
                <button
                  onClick={() => { setActiveTab('feed'); setFeedSubTab('agencies'); }}
                  className="text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-full border border-blue-200"
                >
                  ดู 16 หน่วยงาน สพฐ.
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                <a
                  href="https://info.obec.go.th/districts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 hover:bg-indigo-100/80 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-indigo-700 text-white flex items-center justify-center mb-2 shadow-xs">
                      <span className="material-symbols-outlined text-lg">lan</span>
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm text-indigo-950 group-hover:text-indigo-700">
                      พอร์ทัลเขตพื้นที่ สพฐ. IBNS
                    </h3>
                    <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                      ระบบสารสนเทศ IBNS เชื่อมโยงพอร์ทัลข่าวสารประจำเขตทั่วประเทศ
                    </p>
                  </div>
                  <div className="mt-3 flex items-center text-[11px] font-bold text-indigo-700">
                    <span>info.obec.go.th/districts</span>
                    <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                  </div>
                </a>

                <a
                  href="https://info.bopp.go.th/area"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 hover:bg-sky-100/80 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center mb-2 shadow-xs">
                      <span className="material-symbols-outlined text-lg">database</span>
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm text-sky-950 group-hover:text-blue-700">
                      สารสนเทศ สพฐ. (BOPP)
                    </h3>
                    <p className="text-[11px] text-sky-800 mt-1 leading-relaxed">
                      ข้อมูลสารสนเทศเขตพื้นที่การศึกษา 246 เขต และสถานศึกษาทั่วไทย
                    </p>
                  </div>
                  <div className="mt-3 flex items-center text-[11px] font-bold text-sky-700">
                    <span>info.bopp.go.th/area</span>
                    <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                  </div>
                </a>

                <a
                  href="https://www.bkkp.go.th/web/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 hover:bg-blue-100/80 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-2 shadow-xs">
                      <span className="material-symbols-outlined text-lg">apartment</span>
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm text-blue-950 group-hover:text-blue-700">
                      สพป.กรุงเทพมหานคร
                    </h3>
                    <p className="text-[11px] text-blue-800 mt-1 leading-relaxed">
                      Bangkok Primary Educational Service Area Office พอร์ทัลทางการ
                    </p>
                  </div>
                  <div className="mt-3 flex items-center text-[11px] font-bold text-blue-700">
                    <span>www.bkkp.go.th/web</span>
                    <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                  </div>
                </a>

                <a
                  href="https://www.obec.go.th/th/agency-website"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 hover:bg-emerald-100/80 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center mb-2 shadow-xs">
                      <span className="material-symbols-outlined text-lg">account_balance</span>
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm text-emerald-950 group-hover:text-emerald-700">
                      หน่วยงานในสังกัด สพฐ.
                    </h3>
                    <p className="text-[11px] text-emerald-800 mt-1 leading-relaxed">
                      ศูนย์รวม 16 สำนัก/ศูนย์ส่วนกลาง กระทรวงศึกษาธิการ
                    </p>
                  </div>
                  <div className="mt-3 flex items-center text-[11px] font-bold text-emerald-700">
                    <span>obec.go.th/th/agency-website</span>
                    <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                  </div>
                </a>
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

            {/* Status Filter Tabs (เปิดรับตำแหน่งแล้ว vs ทั้งหมด vs รอประกาศ) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setStatusFilter('all'); setVisibleCount(40); }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                ทั้งหมด ({districts.length})
              </button>
              <button
                onClick={() => { setStatusFilter('announced'); setVisibleCount(40); }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  statusFilter === 'announced'
                    ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/20'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>เปิดรับตำแหน่งแล้ว ({announcedCount})</span>
              </button>
              <button
                onClick={() => { setStatusFilter('pending'); setVisibleCount(40); }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === 'pending'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                รอประกาศ ({pendingCount})
              </button>
            </div>

            {/* Type Filter Chips (สพป. / สพม. / สศศ.) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-xs font-bold text-slate-500 shrink-0">ประเภท:</span>
              <button
                onClick={() => { setTypeFilter('all'); setVisibleCount(40); }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'all'
                    ? 'bg-blue-800 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                ทุกสังกัด ({districts.length})
              </button>
              <button
                onClick={() => { setTypeFilter('สพป.'); setVisibleCount(40); }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'สพป.'
                    ? 'bg-cyan-700 text-white shadow-xs'
                    : 'bg-cyan-50 text-cyan-900 border border-cyan-200 hover:bg-cyan-100'
                }`}
              >
                สพป. ประถมศึกษา ({sppCount})
              </button>
              <button
                onClick={() => { setTypeFilter('สพม.'); setVisibleCount(40); }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'สพม.'
                    ? 'bg-indigo-700 text-white shadow-xs'
                    : 'bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                สพม. มัธยมศึกษา ({spmCount})
              </button>
              <button
                onClick={() => { setTypeFilter('สศศ.'); setVisibleCount(40); }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'สศศ.'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
                }`}
              >
                การศึกษาพิเศษ ({specCount})
              </button>
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
                  onClick={() => { setSelectedRegion(r.id); setVisibleCount(40); }}
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

            {/* Official Sorting Controls (เรียงลำดับข้อมูลทางการ) */}
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span className="material-symbols-outlined text-blue-700 text-base">sort</span>
                <span>เรียงลำดับ:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'official', label: 'ลำดับทางการ สพฐ.', icon: 'format_list_numbered' },
                  { id: 'positions', label: 'ตำแหน่งว่างมากที่สุด', icon: 'trending_up' },
                  { id: 'province', label: 'จังหวัด (ก-ฮ)', icon: 'sort_by_alpha' },
                  { id: 'region', label: 'ตามภูมิภาค', icon: 'public' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSortBy(s.id as any)}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      sortBy === s.id
                        ? 'bg-blue-800 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
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
                    แสดงข้อมูลเขตที่เปิดรับจริงและจำนวนตำแหน่งว่าง สามารถกดดาวน์โหลดเอกสารสมัครหรือเข้าสู่เว็บไซต์เขตได้ทันที
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-semibold">
                  <span className="material-symbols-outlined text-sm text-amber-500">star</span>
                  <span>ติดตามแล้ว {watchlist.length} เขต</span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredDistricts.slice(0, visibleCount).map((d) => {
                  const isSaved = watchlist.includes(d.id);
                  const isLive = d.status === 'open' && d.applicants !== null;
                  const hasAnnouncedPositions = d.positions !== null;

                  return (
                    <div key={d.id} className="py-4 first:pt-0 last:pb-0">
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
                            จังหวัด {d.province} {d.contactPhone ? `• โทร. ${d.contactPhone}` : ''}
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

                      {/* Display Vacancy Positions & Status Prominently */}
                      {hasAnnouncedPositions ? (
                        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 mt-2.5 text-xs shadow-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                            </span>
                            <span className="font-extrabold text-emerald-950 text-sm">
                              เปิดรับสมัคร: {d.positions} อัตรา ({d.positions} ตำแหน่งว่าง)
                            </span>
                          </div>
                          <span className="font-bold text-emerald-900 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-xs text-[11px]">
                            {isLive ? `ผู้สมัคร ${d.applicants?.toLocaleString()} คน (1:${d.ratio})` : 'เปิดรับแล้ว (ประกาศตำแหน่งแล้ว)'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 mt-2.5 text-xs text-slate-600">
                          <span className="flex items-center gap-1 text-slate-600">
                            <span className="material-symbols-outlined text-xs text-slate-400">schedule</span>
                            รอ อ.ก.ค.ศ. เขตพื้นที่สรุปและประกาศจำนวนตำแหน่งว่าง
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                            รอประกาศ
                          </span>
                        </div>
                      )}

                      {/* Jurisdiction Coverage (อำเภอที่รับผิดชอบ) */}
                      {d.jurisdiction && (
                        <div className="mt-2 text-xs bg-slate-50 rounded-lg p-2 border border-slate-200/80">
                          <span className="font-bold text-slate-700">อำเภอในความรับผิดชอบ: </span>
                          <span className="text-slate-600">{d.jurisdiction}</span>
                          {d.headquarters && (
                            <span className="ml-2 font-semibold text-blue-800">
                              (ที่ตั้งสำนักงาน: อ.{d.headquarters})
                            </span>
                          )}
                          {d.formerCode && (
                            <span className="ml-2 text-[11px] text-slate-400">
                              [{d.formerCode}]
                            </span>
                          )}
                        </div>
                      )}

                      {/* Direct Links Action Bar: Download Docs, District Website, IBNS & BOPP */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <a
                          href={d.officialAnnouncementUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs active:scale-95 transition-all"
                          title={`ดาวน์โหลดประกาศรับสมัครและใบสมัคร ${d.name}`}
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                          <span>ดาวน์โหลดเอกสารสมัคร</span>
                        </a>
                        <a
                          href={d.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 font-bold text-xs active:scale-95 transition-all"
                          title={`เข้าสู่เว็บไซต์ สพฐ. ${d.name}`}
                        >
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          <span>เว็บ สพฐ. เขต</span>
                        </a>
                        {d.ibnsUrl && (
                          <a
                            href={d.ibnsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold text-xs active:scale-95 transition-all"
                            title={`พอร์ทัลเขตพื้นที่การศึกษา สพฐ. IBNS (info.obec.go.th)`}
                          >
                            <span className="material-symbols-outlined text-sm">lan</span>
                            <span>พอร์ทัล IBNS</span>
                          </a>
                        )}
                        {d.boppUrl && (
                          <a
                            href={d.boppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 font-bold text-xs active:scale-95 transition-all"
                            title={`สารสนเทศเขตพื้นที่การศึกษา สพฐ. (info.bopp.go.th)`}
                          >
                            <span className="material-symbols-outlined text-sm">database</span>
                            <span>BOPP</span>
                          </a>
                        )}
                        <button
                          onClick={() => setSelectedDistrictForDetails(d)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs active:scale-95 transition-all ml-auto"
                        >
                          <span className="material-symbols-outlined text-sm">info</span>
                          <span>รายละเอียด</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More Pagination for 246 districts */}
              {filteredDistricts.length > visibleCount && (
                <div className="pt-4 flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 mt-4">
                  <button
                    onClick={() => setVisibleCount((prev) => prev + 50)}
                    className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 font-bold text-xs shadow-xs transition-all"
                  >
                    โหลดเขตพื้นที่เพิ่ม (+50 เขต)
                  </button>
                  <button
                    onClick={() => setVisibleCount(filteredDistricts.length)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all"
                  >
                    แสดงทั้งหมด ({filteredDistricts.length} เขต)
                  </button>
                </div>
              )}
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
                    กลุ่มสาขาวิชาเอกหลักและจำนวนตำแหน่งว่างที่เปิดรับ (สพฐ.)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    สรุปจำนวนโควตาตำแหน่งว่างที่ประกาศเปิดรับทั่วประเทศตามกลุ่มสาระการเรียนรู้
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-900 text-xs font-bold border border-blue-200">
                  รอบทั่วไป 2569
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {majors.map((m, idx) => {
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
                      <div className="text-right">
                        {m.positions !== null ? (
                          <div>
                            <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 block">
                              เปิดรับ {m.positions.toLocaleString()} อัตรา
                            </span>
                            {m.applicants !== null && (
                              <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                                ผู้สมัคร {m.applicants.toLocaleString()} คน (1:{m.ratio})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                            รอประกาศ
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

        {/* ================= VIEW 4: OBEC AGENCIES, WATCHLIST & LIVE FEED ================= */}
        {activeTab === 'feed' && (
          <div className="space-y-4">
            {/* Sub-tab Navigation */}
            <div className="flex items-center gap-2 p-1 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <button
                onClick={() => setFeedSubTab('agencies')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  feedSubTab === 'agencies'
                    ? 'bg-blue-700 text-white shadow-xs shadow-blue-500/20'
                    : 'text-slate-600 hover:text-blue-700 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-base">account_balance</span>
                <span>หน่วยงาน สพฐ. ({centralAgencies.length})</span>
              </button>
              <button
                onClick={() => setFeedSubTab('watchlist')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  feedSubTab === 'watchlist'
                    ? 'bg-blue-700 text-white shadow-xs shadow-blue-500/20'
                    : 'text-slate-600 hover:text-blue-700 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-base">star</span>
                <span>เขตที่ติดตาม ({watchlist.length})</span>
              </button>
              <button
                onClick={() => setFeedSubTab('announcements')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  feedSubTab === 'announcements'
                    ? 'bg-blue-700 text-white shadow-xs shadow-blue-500/20'
                    : 'text-slate-600 hover:text-blue-700 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-base">notifications</span>
                <span>ประกาศ สพฐ. ({feedItems.length})</span>
              </button>
            </div>

            {/* SUBTAB 1: OFFICIAL OBEC CENTRAL AGENCIES */}
            {feedSubTab === 'agencies' && (
              <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-700 text-xl">account_balance</span>
                      เว็บไซต์หน่วยงานในสังกัด สพฐ. ({centralAgencies.length} สำนัก/หน่วยงานส่วนกลาง)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ข้อมูลอย่างเป็นทางการจาก obec.go.th/th/agency-website เชื่อมต่อลิงก์ตรงทุกสำนัก
                    </p>
                  </div>
                  <a
                    href="https://www.obec.go.th/th/agency-website"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full border border-blue-200 font-bold transition-all"
                  >
                    <span>เว็บไซต์หลัก สพฐ.</span>
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </a>
                </div>

                {/* Agency Search */}
                <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 gap-2 focus-within:border-blue-500 focus-within:bg-white transition-all">
                  <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
                  <input
                    type="text"
                    className="w-full bg-transparent outline-none text-xs text-slate-900 placeholder:text-slate-400"
                    placeholder="ค้นหาสำนัก เช่น บริหารงานบุคคล, นโยบายและแผน, ทดสอบทางการศึกษา..."
                    value={agencySearch}
                    onChange={(e) => setAgencySearch(e.target.value)}
                  />
                  {agencySearch && (
                    <button onClick={() => setAgencySearch('')} className="text-slate-400 hover:text-slate-600">
                      <span className="material-symbols-outlined text-xs">close</span>
                    </button>
                  )}
                </div>

                {/* Agency Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredAgencies.map((agency) => (
                    <div
                      key={agency.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                            {agency.category}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                          {agency.name}
                        </h3>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                          {agency.description}
                        </p>
                      </div>
                      <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                          {agency.url}
                        </span>
                        <a
                          href={agency.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs shadow-xs active:scale-95 transition-all"
                        >
                          <span>เข้าเว็บไซต์</span>
                          <span className="material-symbols-outlined text-xs">launch</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SUBTAB 2: WATCHLIST */}
            {feedSubTab === 'watchlist' && (
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
                  แสดงข้อมูลตำแหน่งที่เปิดรับจริง พร้อมลิงก์ดาวน์โหลดเอกสารสมัครตรงของแต่ละเขต
                </p>

                <div className="space-y-3">
                  {watchlist.map((wid) => {
                    const item = districts.find((d) => d.id === wid);
                    if (!item) return null;
                    const isLive = item.status === 'open' && item.applicants !== null;
                    return (
                      <div
                        key={wid}
                        className="p-3.5 rounded-xl bg-gradient-to-r from-amber-50/70 via-orange-50/50 to-amber-50/70 border border-amber-200 text-xs shadow-xs space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm block">{item.name}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-800 border border-amber-200">
                                {item.type}
                              </span>
                            </div>
                            {item.positions !== null ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 font-extrabold text-xs border border-emerald-200">
                                <span className="material-symbols-outlined text-sm text-emerald-700">check_circle</span>
                                <span>เปิดรับสมัครจริง: {item.positions} อัตรา</span>
                              </div>
                            ) : (
                              <span className="text-slate-600 block">รอประกาศจำนวนตำแหน่ง</span>
                            )}
                            <span className="text-slate-600 block">
                              จังหวัด {item.province} • {isLive ? `ผู้สมัคร: ${item.applicants?.toLocaleString()} คน (อัตรา 1:${item.ratio})` : `เปิดรับสมัครออนไลน์: ${OFFICIAL_OPEN_DATE_STR}`}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleWatchlist(wid)}
                            className="text-rose-600 font-bold hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-all border border-rose-200 text-xs shrink-0"
                          >
                            ยกเลิกติดตาม
                          </button>
                        </div>

                        {/* Direct Links in Watchlist */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60">
                          <a
                            href={item.officialAnnouncementUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all"
                          >
                            <span className="material-symbols-outlined text-sm">download</span>
                            <span>ดาวน์โหลดเอกสารสมัคร</span>
                          </a>
                          <a
                            href={item.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-blue-900 border border-slate-300 font-bold text-xs transition-all"
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            <span>เข้าเว็บเขต</span>
                          </a>
                          {item.ibnsUrl && (
                            <a
                              href={item.ibnsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold text-xs transition-all"
                            >
                              <span className="material-symbols-outlined text-sm">lan</span>
                              <span>พอร์ทัล IBNS</span>
                            </a>
                          )}
                          {item.boppUrl && (
                            <a
                              href={item.boppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 font-bold text-xs transition-all"
                            >
                              <span className="material-symbols-outlined text-sm">database</span>
                              <span>BOPP</span>
                            </a>
                          )}
                          <button
                            onClick={() => setSelectedDistrictForDetails(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-xs ml-auto"
                          >
                            <span className="material-symbols-outlined text-sm">info</span>
                            <span>รายละเอียด</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* SUBTAB 3: OFFICIAL ANNOUNCEMENT FEED */}
            {feedSubTab === 'announcements' && (
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
            )}
          </div>
        )}
      </main>

      {/* ================= MODAL: DISTRICT DETAILS & APPLICATION DOCUMENTS ================= */}
      {selectedDistrictForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-5 space-y-4">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    selectedDistrictForDetails.type === 'สพม.' 
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                      : 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                  }`}>
                    {selectedDistrictForDetails.type}
                  </span>
                  <span className="text-xs text-slate-500">
                    จังหวัด {selectedDistrictForDetails.province}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {selectedDistrictForDetails.name}
                </h3>
                <p className="text-xs text-slate-500">
                  สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)
                </p>
              </div>
              <button
                onClick={() => setSelectedDistrictForDetails(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                aria-label="ปิดหน้าต่าง"
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            {/* Vacancy Callout in Modal */}
            {selectedDistrictForDetails.positions !== null ? (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm">
                  <span className="material-symbols-outlined text-emerald-600">assignment_turned_in</span>
                  <span>เปิดรับสมัครจริง: {selectedDistrictForDetails.positions} อัตรา ({selectedDistrictForDetails.positions} ตำแหน่งว่าง)</span>
                </div>
                <p className="text-emerald-800 mt-1">
                  อ.ก.ค.ศ. เขตพื้นที่การศึกษาได้ออกประกาศรายละเอียดตำแหน่งว่างและวิชาเอกอย่างเป็นทางการแล้ว
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                รอ อ.ก.ค.ศ. เขตพื้นที่ประกาศจำนวนตำแหน่งว่าง
              </div>
            )}

            {/* Direct Link Action Cards (Download & Official Site) */}
            <div className="space-y-2.5">
              <a
                href={selectedDistrictForDetails.officialAnnouncementUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 active:scale-98 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xl">download</span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm">ดาวน์โหลดประกาศ & เอกสารสมัคร</div>
                    <div className="text-[11px] font-normal text-emerald-100">ไฟล์ประกาศรับสมัครสอบแข่งขันและแบบฟอร์ม</div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </a>

              <a
                href={selectedDistrictForDetails.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 hover:bg-blue-100 border border-blue-200 text-blue-900 font-bold text-sm active:scale-98 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                    <span className="material-symbols-outlined text-xl">open_in_new</span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm">เข้าสู่เว็บไซต์ทางการ สพฐ. ประจำเขต</div>
                    <div className="text-[11px] font-normal text-slate-600">{selectedDistrictForDetails.websiteUrl}</div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-lg text-blue-600">launch</span>
              </a>

              {selectedDistrictForDetails.ibnsUrl && (
                <a
                  href={selectedDistrictForDetails.ibnsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-indigo-50 to-blue-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-950 font-bold text-sm active:scale-98 transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-700 text-white flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl">lan</span>
                    </div>
                    <div className="text-left">
                      <div className="text-sm">ระบบสารสนเทศ สพฐ. IBNS (พอร์ทัลเขต)</div>
                      <div className="text-[11px] font-normal text-indigo-700">{selectedDistrictForDetails.ibnsUrl}</div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-lg text-indigo-700">launch</span>
                </a>
              )}

              {selectedDistrictForDetails.boppUrl && (
                <a
                  href={selectedDistrictForDetails.boppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 hover:bg-sky-100 border border-sky-200 text-sky-950 font-bold text-sm active:scale-98 transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl">database</span>
                    </div>
                    <div className="text-left">
                      <div className="text-sm">สารสนเทศเขตพื้นที่การศึกษา สพฐ. (BOPP)</div>
                      <div className="text-[11px] font-normal text-sky-700">{selectedDistrictForDetails.boppUrl}</div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-lg text-sky-700">launch</span>
                </a>
              )}
            </div>

            {/* Jurisdiction Coverage Callout */}
            {selectedDistrictForDetails.jurisdiction && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-blue-700">map</span>
                  <span>ขอบเขตพื้นที่และอำเภอที่รับผิดชอบ:</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-5">
                  {selectedDistrictForDetails.jurisdiction}
                </p>
                {selectedDistrictForDetails.headquarters && (
                  <p className="text-blue-900 font-semibold pl-5 pt-1">
                    ที่ตั้งสำนักงานเขต: อำเภอ{selectedDistrictForDetails.headquarters}
                  </p>
                )}
                {selectedDistrictForDetails.formerCode && (
                  <p className="text-slate-500 pl-5 text-[11px]">
                    เดิมคือ: {selectedDistrictForDetails.formerCode}
                  </p>
                )}
              </div>
            )}

            {/* Contact Phone if available */}
            {selectedDistrictForDetails.contactPhone && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="material-symbols-outlined text-base text-blue-600">call</span>
                  <span>เบอร์โทรศัพท์ติดต่อสอบถาม: {selectedDistrictForDetails.contactPhone}</span>
                </div>
                <a
                  href={`tel:${selectedDistrictForDetails.contactPhone}`}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700"
                >
                  โทรออก
                </a>
              </div>
            )}

            {/* Checklist of required application documents */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-blue-700">task</span>
                รายการเอกสารหลักฐานที่ต้องเตรียมในการสมัคร:
              </h4>
              <ul className="text-xs text-slate-600 space-y-1.5 list-none pl-1">
                {[
                  '1. ใบสมัครสอบแข่งขันครูผู้ช่วย (พิมพ์ออกจากระบบรับสมัครออนไลน์)',
                  '2. รูปถ่ายหน้าตรงไม่สวมหมวกและแว่นตาดำ ถ่ายไว้ไม่เกิน 6 เดือน ขนาด 1 x 1.5 นิ้ว',
                  '3. ปริญญาบัตร หรือหนังสือรับรองคุณวุฒิ และใบรายงานผลการศึกษา (Transcript)',
                  '4. ใบอนุญาตประกอบวิชาชีพครู หรือหลักฐานรับรองสิทธิจากคุรุสภา (ยังไม่หมดอายุในวันปิดรับสมัคร)',
                  '5. สำเนาบัตรประจำตัวประชาชน และสำเนาทะเบียนบ้าน',
                  '6. ใบรับรองแพทย์จากสถานพยาบาลของรัฐ (ออกไว้ไม่เกิน 1 เดือน นับถึงวันสมัคร)',
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-emerald-600 text-sm mt-0.5">check_circle</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Critical Note */}
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-amber-600">warning</span>
                ข้อกำหนดสำคัญตามระเบียบ สพฐ.:
              </div>
              <p className="leading-relaxed">
                ผู้สมัครสอบสามารถเลือกสมัครได้เพียง <strong>1 กลุ่มวิชาเอก</strong> ใน <strong>1 เขตพื้นที่การศึกษา</strong> เท่านั้น 
                หากตรวจพบว่าสมัครซ้ำซ้อนจะถือว่าเป็นโมฆะและตัดสิทธิ์การสอบทุกเขต
              </p>
            </div>

            {/* Close Button */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedDistrictForDetails(null)}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-all"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

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
          <span className="material-symbols-outlined text-xl" data-icon="account_balance">account_balance</span>
          <span className="text-[11px] font-semibold mt-0.5">หน่วยงาน & ติดตาม</span>
        </button>
      </nav>
    </div>
  );
}
