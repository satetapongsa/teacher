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
  const [selectedProvince, setSelectedProvince] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'สพป.' | 'สพม.' | 'สศศ.'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'announced' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'official' | 'positions' | 'province' | 'region'>('official');
  const [visibleCount, setVisibleCount] = useState<number>(40);
  const [feedItems] = useState<LiveFeedItem[]>(OFFICIAL_FEED);
  const [centralAgencies] = useState<CentralAgencyData[]>(OFFICIAL_CENTRAL_AGENCIES);
  const [agencySearch, setAgencySearch] = useState('');
  const [feedSubTab, setFeedSubTab] = useState<'agencies' | 'watchlist' | 'announcements'>('agencies');

  // Theme state: dark / light mode toggle
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('obec_theme_mode');
    if (saved) return saved === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('obec_theme_mode', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('obec_theme_mode', 'light');
    }
  }, [darkMode]);

  // ปักดาวเริ่มต้นให้ติดตามแค่ อุดรธานี และ กรุงเทพมหานคร ตามคำสั่ง
  const [watchlist, setWatchlist] = useState<string[]>([
    'spm-bkk-1', // สพม.กรุงเทพมหานคร เขต 1 (เปิดรับจริง 49 อัตรา)
    'spp-bkk',   // สพป.กรุงเทพมหานคร (เปิดรับจริง 25 อัตรา)
    'spp-udon-1', // สพป.อุดรธานี เขต 1 (เปิดรับจริง 25 อัตรา)
    'spp-udon-4', // สพป.อุดรธานี เขต 4 (เปิดรับจริง 36 อัตรา)
    'spm-udon',  // สพม.อุดรธานี (เปิดรับจริง 32 อัตรา)
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

  // สรุปรายชื่อจังหวัดทั้งหมดเพื่อการเลื่อนหาและเลือกดูได้ครบทุกจังหวัดในมือถือ
  const allProvinces = useMemo(() => {
    const set = new Set<string>();
    districts.forEach((d) => {
      if (d.province && d.province !== 'ส่วนกลาง (ทั่วประเทศ)') {
        const parts = d.province.split(' ');
        parts.forEach((p) => {
          if (p.trim()) set.add(p.trim());
        });
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [districts]);

  const filteredDistricts = useMemo(() => {
    const list = districts.filter((d) => {
      const matchSearch =
        searchDistrict.trim() === '' ||
        d.name.toLowerCase().includes(searchDistrict.toLowerCase()) ||
        d.province.toLowerCase().includes(searchDistrict.toLowerCase()) ||
        (d.jurisdiction && d.jurisdiction.toLowerCase().includes(searchDistrict.toLowerCase())) ||
        (d.headquarters && d.headquarters.toLowerCase().includes(searchDistrict.toLowerCase()));
      const matchProvince =
        selectedProvince === 'all' ||
        d.province.includes(selectedProvince) ||
        d.name.includes(selectedProvince);
      const matchRegion = selectedRegion === 'all' || d.region === selectedRegion;
      const matchType = typeFilter === 'all' || d.type === typeFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'announced' && d.positions !== null) ||
        (statusFilter === 'pending' && d.positions === null);
      return matchSearch && matchProvince && matchRegion && matchType && matchStatus;
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
  }, [districts, searchDistrict, selectedProvince, selectedRegion, typeFilter, statusFilter, sortBy]);

  const filteredAgencies = useMemo(() => {
    if (!agencySearch) return centralAgencies;
    const q = agencySearch.toLowerCase();
    return centralAgencies.filter(
      (a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    );
  }, [centralAgencies, agencySearch]);

  return (
    <div className={`min-h-screen pb-28 antialiased selection:bg-blue-600 selection:text-white transition-colors duration-200 ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Top Header Bar */}
      <header className={`sticky top-0 z-40 backdrop-blur-md shadow-sm border-b transition-colors duration-200 ${
        darkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-blue-100'
      }`}>
        <div className="flex justify-between items-center w-full px-4 py-3 max-w-screen-md mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <span className="material-symbols-outlined text-2xl" data-icon="analytics">analytics</span>
            </div>
            <div>
              <h1 className={`text-lg font-bold tracking-tight leading-tight flex items-center gap-1.5 ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                สถิติครูผู้ช่วย 2569
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/60 dark:text-blue-300 dark:border-blue-700">
                  สพฐ.
                </span>
              </h1>
              <span className={`text-xs block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Dark Mode Toggle Button */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
              className={`p-2 rounded-xl transition-all duration-150 border shadow-xs active:scale-95 ${
                darkMode
                  ? 'bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
              title={darkMode ? 'สลับเป็นโหมดสว่าง (Light Mode)' : 'สลับเป็นโหมดมืด (Dark Mode)'}
            >
              <span className="material-symbols-outlined text-lg">
                {darkMode ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {/* Live Sync Pill */}
            <div className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-xs ${
              darkMode 
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
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
              className={`p-2 rounded-xl active:scale-95 transition-all duration-150 border shadow-xs ${
                darkMode
                  ? 'text-blue-400 bg-slate-800 hover:bg-slate-700 border-slate-700'
                  : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200'
              }`}
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
            <div className={`rounded-2xl border p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
              darkMode
                ? 'border-emerald-800/80 bg-gradient-to-r from-emerald-950/70 via-teal-950/60 to-slate-900 text-emerald-200'
                : 'border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 text-emerald-950'
            }`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <span className="material-symbols-outlined text-2xl">download_for_offline</span>
                </div>
                <div>
                  <h3 className={`font-bold text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-950'}`}>
                    ตรวจสอบเขตที่เปิดรับจริง & ดาวน์โหลดเอกสารสมัคร
                  </h3>
                  <p className={`text-xs mt-0.5 leading-relaxed ${darkMode ? 'text-emerald-400' : 'text-emerald-800'}`}>
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
            <div className={`rounded-xl border p-4 flex gap-3 items-start shadow-xs transition-colors ${
              darkMode
                ? 'border-blue-900/60 bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/70'
                : 'border-blue-200 bg-gradient-to-r from-blue-50/90 via-sky-50/80 to-indigo-50/90'
            }`}>
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-xl">info</span>
              </div>
              <div className="text-xs space-y-1">
                <p className={`font-bold text-sm ${darkMode ? 'text-blue-300' : 'text-blue-950'}`}>
                  สถานะการประกาศตำแหน่งว่าง สพฐ. 2569:
                </p>
                <p className={`leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {summary.statusText} ข้อมูลตำแหน่งว่างของแต่ละจังหวัดและวิชาเอกได้รับการอัปเดตตามประกาศทางการของ อ.ก.ค.ศ. เขตพื้นที่การศึกษา
                </p>
              </div>
            </div>

            {/* Key Metric KPI Bento Grid (Real Announced Positions & Live State) */}
            <section aria-label="ตัวชี้วัดสำคัญระดับประเทศ" className="grid grid-cols-2 gap-3 sm:gap-4">
              {/* Metric 1: Total Applicants (Blue / Indigo) */}
              <article className={`rounded-2xl p-4 border shadow-sm flex flex-col justify-between hover:shadow-md transition-all ${
                darkMode
                  ? 'bg-gradient-to-br from-blue-950/60 to-slate-900 border-blue-900/80 text-blue-200'
                  : 'bg-gradient-to-br from-blue-50 to-indigo-50/80 border-blue-200'
              }`}>
                <div>
                  <div className={`flex items-center justify-between mb-1.5 ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>
                    <span className="text-xs font-bold uppercase tracking-wide">ผู้สมัครรวมทั่วประเทศ</span>
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="group">group</span>
                    </div>
                  </div>
                  <div className={`text-xl sm:text-2xl font-black tracking-tight mt-1 font-sans ${darkMode ? 'text-white' : 'text-blue-950'}`}>
                    {summary.totalApplicants !== null ? summary.totalApplicants.toLocaleString() : 'รอเปิดรับสมัคร'}
                  </div>
                </div>
                <div className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                  <span className="material-symbols-outlined text-sm">event</span>
                  <span>เปิดระบบ 19 ต.ค. 69 (08:30 น.)</span>
                </div>
              </article>

              {/* Metric 2: Total Positions (Emerald / Teal) - Shows Real Announced Vacancies */}
              <article className={`rounded-2xl p-4 border shadow-sm flex flex-col justify-between hover:shadow-md transition-all ${
                darkMode
                  ? 'bg-gradient-to-br from-emerald-950/60 to-slate-900 border-emerald-900/80 text-emerald-200'
                  : 'bg-gradient-to-br from-emerald-50 to-teal-50/80 border-emerald-200'
              }`}>
                <div>
                  <div className={`flex items-center justify-between mb-1.5 ${darkMode ? 'text-emerald-300' : 'text-emerald-900'}`}>
                    <span className="text-xs font-bold uppercase tracking-wide">ตำแหน่งเปิดรับทั้งหมด</span>
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="badge">badge</span>
                    </div>
                  </div>
                  <div className={`text-xl sm:text-2xl font-black tracking-tight mt-1 font-sans ${darkMode ? 'text-emerald-300' : 'text-emerald-950'}`}>
                    {summary.totalPositions !== null ? `${summary.totalPositions.toLocaleString()} อัตรา` : 'รอประกาศทางการ'}
                  </div>
                </div>
                <div className={`mt-3 flex items-center justify-between text-xs font-medium ${darkMode ? 'text-emerald-400' : 'text-emerald-800'}`}>
                  <span>ประกาศแล้ว {announcedCount} เขต</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    darkMode ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-emerald-100 text-emerald-900 border-emerald-200'
                  }`}>
                    เปิดรับจริง
                  </span>
                </div>
              </article>

              {/* Metric 3: Average Competition Ratio (Amber / Orange) */}
              <article className={`rounded-2xl p-4 border shadow-sm flex flex-col justify-between hover:shadow-md transition-all ${
                darkMode
                  ? 'bg-gradient-to-br from-amber-950/60 to-slate-900 border-amber-900/80 text-amber-200'
                  : 'bg-gradient-to-br from-amber-50 to-orange-50/80 border-amber-200'
              }`}>
                <div>
                  <div className={`flex items-center justify-between mb-1.5 ${darkMode ? 'text-amber-300' : 'text-amber-950'}`}>
                    <span className="text-xs font-bold uppercase tracking-wide">อัตราแข่งขันเฉลี่ย</span>
                    <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="balance">balance</span>
                    </div>
                  </div>
                  <div className={`text-xl sm:text-2xl font-black tracking-tight mt-1 font-sans ${darkMode ? 'text-amber-300' : 'text-amber-950'}`}>
                    {summary.averageRatio !== null ? `1 : ${summary.averageRatio}` : 'คำนวณวันเปิดรับ'}
                  </div>
                </div>
                <div className={`mt-3 text-xs font-medium flex items-center gap-1.5 ${darkMode ? 'text-amber-400' : 'text-amber-800'}`}>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>ประมวลผลเมื่อเริ่มรับสมัคร</span>
                </div>
              </article>

              {/* Metric 4: Peak Competition District (Violet / Purple) */}
              <article className={`rounded-2xl p-4 border shadow-sm flex flex-col justify-between hover:shadow-md transition-all ${
                darkMode
                  ? 'bg-gradient-to-br from-purple-950/60 to-slate-900 border-purple-900/80 text-purple-200'
                  : 'bg-gradient-to-br from-purple-50 to-fuchsia-50/80 border-purple-200'
              }`}>
                <div>
                  <div className={`flex items-center justify-between mb-1.5 ${darkMode ? 'text-purple-300' : 'text-purple-950'}`}>
                    <span className="text-xs font-bold uppercase tracking-wide">ยอดรับสูงสุด</span>
                    <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-base" data-icon="local_fire_department">local_fire_department</span>
                    </div>
                  </div>
                  <div className={`text-sm sm:text-base font-black tracking-tight mt-1 font-sans truncate ${darkMode ? 'text-purple-300' : 'text-purple-950'}`}>
                    {summary.peakDistrict ? summary.peakDistrict : 'สพม.กทม. เขต 2 (82 อัตรา)'}
                  </div>
                </div>
                <div className={`mt-3 text-xs font-medium truncate ${darkMode ? 'text-purple-400' : 'text-purple-800'}`}>
                  ตำแหน่งเปิดรับสูงสุด
                </div>
              </article>
            </section>

            {/* Official Schedule Timeline Section (ข้อมูลจริงที่ตรวจสอบได้) */}
            <section className={`rounded-2xl p-5 border shadow-sm transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-blue-500 text-xl" data-icon="event">event</span>
                    ปฏิทินการสอบแข่งขันครูผู้ช่วย 2569 (สพฐ. รอบทั่วไป)
                  </h2>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>กำหนดการอย่างเป็นทางการสำหรับผู้สมัครทั่วประเทศ</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  darkMode ? 'bg-blue-950 text-blue-300 border-blue-800' : 'bg-blue-100 text-blue-900 border-blue-200'
                }`}>
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
                        ? darkMode
                          ? 'border-blue-700 bg-blue-950/60 shadow-xs ring-1 ring-blue-500/30'
                          : 'border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-xs ring-1 ring-blue-400/30'
                        : step.done
                        ? darkMode
                          ? 'border-emerald-800/80 bg-emerald-950/40'
                          : 'border-emerald-200 bg-emerald-50/50'
                        : darkMode
                        ? 'border-slate-800 bg-slate-800/60'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-bold flex items-center gap-1.5 ${
                        step.highlight 
                          ? darkMode ? 'text-blue-300' : 'text-blue-900' 
                          : step.done 
                          ? darkMode ? 'text-emerald-300' : 'text-emerald-800' 
                          : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        <span className={`material-symbols-outlined text-base ${
                          step.highlight ? 'text-blue-500' : step.done ? 'text-emerald-500' : 'text-slate-400'
                        }`}>
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
                        <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] border ${
                          darkMode ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}>
                          ประกาศตำแหน่งแล้ว
                        </span>
                      )}
                    </div>
                    <h3 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{step.title}</h3>
                    <p className={`text-xs mt-0.5 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Official Data Sources Showcase */}
            <section className={`rounded-2xl p-5 border shadow-sm space-y-3 transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-blue-500 text-xl">hub</span>
                    ศูนย์รวมข้อมูลและเว็บไซต์ทางการ สพฐ.
                  </h2>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    เชื่อมต่อฐานข้อมูลทางการครบถ้วน: สารสนเทศ BOPP, พอร์ทัล IBNS, สพป.กทม., หน่วยงาน สพฐ. และ ขอบเขตพื้นที่วิกิพีเดีย
                  </p>
                </div>
                <button
                  onClick={() => { setActiveTab('feed'); setFeedSubTab('agencies'); }}
                  className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${
                    darkMode
                      ? 'text-blue-300 bg-blue-950/60 border-blue-800 hover:bg-blue-900/60'
                      : 'text-blue-700 hover:text-blue-800 bg-blue-50 border-blue-200'
                  }`}
                >
                  ดู 16 หน่วยงาน สพฐ.
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                <a
                  href="https://info.obec.go.th/districts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between group ${
                    darkMode
                      ? 'border-indigo-900/80 bg-gradient-to-br from-indigo-950/60 to-slate-900 hover:border-indigo-700 hover:bg-indigo-950/80'
                      : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 hover:bg-indigo-100/80'
                  }`}
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-indigo-700 text-white flex items-center justify-center mb-2 shadow-xs">
                      <span className="material-symbols-outlined text-lg">lan</span>
                    </div>
                    <h3 className={`font-bold text-xs sm:text-sm ${
                      darkMode ? 'text-indigo-200 group-hover:text-white' : 'text-indigo-950 group-hover:text-indigo-700'
                    }`}>
                      พอร์ทัลเขตพื้นที่ สพฐ. IBNS
                    </h3>
                    <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-indigo-300' : 'text-indigo-800'}`}>
                      ระบบสารสนเทศ IBNS เชื่อมโยงพอร์ทัลข่าวสารประจำเขตทั่วประเทศ
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center text-[11px] font-bold ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>
                    <span>info.obec.go.th/districts</span>
                    <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                  </div>
                </a>

                <a
                  href="https://info.bopp.go.th/area"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between group ${
                    darkMode
                      ? 'border-sky-900/80 bg-gradient-to-br from-sky-950/60 to-slate-900 hover:border-sky-700 hover:bg-sky-950/80'
                      : 'border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 hover:bg-sky-100/80'
                  }`}
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center mb-2 shadow-xs">
                      <span className="material-symbols-outlined text-lg">database</span>
                    </div>
                    <h3 className={`font-bold text-xs sm:text-sm ${
                      darkMode ? 'text-sky-200 group-hover:text-white' : 'text-sky-950 group-hover:text-blue-700'
                    }`}>
                      สารสนเทศ สพฐ. (BOPP)
                    </h3>
                    <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-sky-300' : 'text-sky-800'}`}>
                      ข้อมูลสารสนเทศเขตพื้นที่การศึกษา 246 เขต และสถานศึกษาทั่วไทย
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center text-[11px] font-bold ${darkMode ? 'text-sky-400' : 'text-sky-700'}`}>
                    <span>info.bopp.go.th/area</span>
                    <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                  </div>
                </a>

                <a
                  href="https://www.bkkp.go.th/web/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between group ${
                    darkMode
                      ? 'border-blue-900/80 bg-gradient-to-br from-blue-950/60 to-slate-900 hover:border-blue-700 hover:bg-blue-950/80'
                      : 'border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 hover:bg-blue-100/80'
                  }`}
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-2 shadow-xs">
                      <span className="material-symbols-outlined text-lg">apartment</span>
                    </div>
                    <h3 className={`font-bold text-xs sm:text-sm ${
                      darkMode ? 'text-blue-200 group-hover:text-white' : 'text-blue-950 group-hover:text-blue-700'
                    }`}>
                      สพป.กรุงเทพมหานคร
                    </h3>
                    <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                      Bangkok Primary Educational Service Area Office พอร์ทัลทางการ
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center text-[11px] font-bold ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                    <span>www.bkkp.go.th/web</span>
                    <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                  </div>
                </a>

                <a
                  href="https://www.obec.go.th/th/agency-website"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between group ${
                    darkMode
                      ? 'border-emerald-900/80 bg-gradient-to-br from-emerald-950/60 to-slate-900 hover:border-emerald-700 hover:bg-emerald-950/80'
                      : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 hover:bg-emerald-100/80'
                  }`}
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center mb-2 shadow-xs">
                      <span className="material-symbols-outlined text-lg">account_balance</span>
                    </div>
                    <h3 className={`font-bold text-xs sm:text-sm ${
                      darkMode ? 'text-emerald-200 group-hover:text-white' : 'text-emerald-950 group-hover:text-emerald-700'
                    }`}>
                      หน่วยงานในสังกัด สพฐ.
                    </h3>
                    <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>
                      ศูนย์รวม 16 สำนัก/ศูนย์ส่วนกลาง กระทรวงศึกษาธิการ
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center text-[11px] font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
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
            {/* Search & Province Selector Bar (Responsive on Mobile) */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              {/* Search Box */}
              <div className={`flex-1 flex items-center rounded-2xl border px-3.5 py-2.5 gap-2.5 shadow-sm transition-all ${
                darkMode
                  ? 'bg-slate-900 border-slate-700 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-900/40'
                  : 'bg-white border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100'
              }`}>
                <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
                <input
                  type="text"
                  className={`w-full bg-transparent outline-none text-xs sm:text-sm placeholder:text-slate-400 ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}
                  placeholder="ค้นหาชื่อเขต, จังหวัด (เช่น อุดรธานี, กทม.), อำเภอ..."
                  value={searchDistrict}
                  onChange={(e) => {
                    setSearchDistrict(e.target.value);
                    setVisibleCount(districts.length);
                  }}
                />
                {searchDistrict && (
                  <button
                    onClick={() => setSearchDistrict('')}
                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label="ล้างคำค้นหา"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                )}
              </div>

              {/* Province Selector Dropdown (เลื่อนหาและเลือกได้ทุกจังหวัดครบ 77 จังหวัด) */}
              <div className={`sm:w-64 flex items-center rounded-2xl border px-3 py-2 gap-2 shadow-sm transition-all ${
                darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                <span className="material-symbols-outlined text-base text-blue-500 shrink-0">location_city</span>
                <select
                  value={selectedProvince}
                  onChange={(e) => {
                    setSelectedProvince(e.target.value);
                    setVisibleCount(districts.length);
                  }}
                  className={`w-full bg-transparent outline-none text-xs font-semibold cursor-pointer py-1 ${
                    darkMode ? 'text-white bg-slate-900' : 'text-slate-900 bg-white'
                  }`}
                  aria-label="เลือกจังหวัดที่ต้องการดู"
                >
                  <option value="all" className={darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>
                    ทุกจังหวัด (77 จังหวัด / 246 เขต)
                  </option>
                  {allProvinces.map((prov) => (
                    <option key={prov} value={prov} className={darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>
                      จังหวัด{prov}
                    </option>
                  ))}
                </select>
                {selectedProvince !== 'all' && (
                  <button
                    onClick={() => {
                      setSelectedProvince('all');
                      setVisibleCount(40);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-500"
                    title="ล้างการเลือกจังหวัด"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Filter Tag Buttons for Top Searched Provinces */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
              <span className={`font-semibold shrink-0 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>ค้นหายอดนิยม:</span>
              {['อุดรธานี', 'กรุงเทพมหานคร', 'เชียงใหม่', 'ขอนแก่น', 'อุบลราชธานี', 'นครราชสีมา', 'สงขลา'].map((prov) => (
                <button
                  key={prov}
                  onClick={() => {
                    setSelectedProvince(prov);
                    setSearchDistrict('');
                    setStatusFilter('all');
                    setSelectedRegion('all');
                    setVisibleCount(districts.length);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-all ${
                    selectedProvince === prov || searchDistrict === prov
                      ? 'bg-blue-600 text-white shadow-xs'
                      : darkMode
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  {prov}
                </button>
              ))}
              {(selectedProvince !== 'all' || searchDistrict !== '') && (
                <button
                  onClick={() => {
                    setSelectedProvince('all');
                    setSearchDistrict('');
                    setVisibleCount(40);
                  }}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0 border border-rose-300 dark:border-rose-800 flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-xs">refresh</span>
                  <span>ล้างตัวกรอง</span>
                </button>
              )}
            </div>

            {/* Results Count & Show All toggle */}
            <div className={`flex flex-wrap items-center justify-between gap-2 px-1 text-xs ${
              darkMode ? 'text-slate-400' : 'text-slate-600'
            }`}>
              <span>
                พบ <strong className={darkMode ? 'text-white' : 'text-slate-900'}>{filteredDistricts.length}</strong> เขตพื้นที่
                {selectedProvince !== 'all' && <span> ในจังหวัด <strong className="text-blue-500">{selectedProvince}</strong></span>}
                {searchDistrict && <span> (คำค้น: "<strong className="text-blue-500">{searchDistrict}</strong>")</span>}
              </span>
              {filteredDistricts.length > visibleCount ? (
                <button
                  onClick={() => setVisibleCount(filteredDistricts.length)}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-xs flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">unfold_more</span>
                  <span>แสดงให้ครบทุกเขต ({filteredDistricts.length} เขต)</span>
                </button>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">check</span>
                  <span>แสดงครบทุกเขตในหน้านี้แล้ว</span>
                </span>
              )}
            </div>

            {/* Status Filter Tabs (เปิดรับตำแหน่งแล้ว vs ทั้งหมด vs รอประกาศ) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setStatusFilter('all'); setVisibleCount(40); }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
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
                    : darkMode
                    ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/60'
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
                    : darkMode
                    ? 'bg-slate-900 text-slate-400 border border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                รอประกาศ ({pendingCount})
              </button>
            </div>

            {/* Type Filter Chips (สพป. / สพม. / สศศ.) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className={`text-xs font-bold shrink-0 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>ประเภท:</span>
              <button
                onClick={() => { setTypeFilter('all'); setVisibleCount(40); }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'all'
                    ? 'bg-blue-800 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
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
                    : darkMode
                    ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-800 hover:bg-cyan-900/60'
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
                    : darkMode
                    ? 'bg-indigo-950/40 text-indigo-300 border border-indigo-800 hover:bg-indigo-900/60'
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
                    : darkMode
                    ? 'bg-purple-950/40 text-purple-300 border border-purple-800 hover:bg-purple-900/60'
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
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : darkMode
                      ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:text-blue-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Official Sorting Controls (เรียงลำดับข้อมูลทางการ) */}
            <div className={`rounded-xl p-3 border shadow-xs flex flex-wrap items-center justify-between gap-2.5 ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
            }`}>
              <div className={`flex items-center gap-1.5 text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <span className="material-symbols-outlined text-blue-500 text-base">sort</span>
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
                        ? 'bg-blue-600 text-white shadow-xs'
                        : darkMode
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
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
            <section className={`rounded-2xl p-4 sm:p-5 border shadow-sm transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-blue-500 text-xl">map</span>
                    รายชื่อเขตพื้นที่การศึกษา สพฐ. ({filteredDistricts.length} เขต)
                  </h2>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    แสดงข้อมูลเขตที่เปิดรับจริงและจำนวนตำแหน่งว่าง สามารถกดดาวน์โหลดเอกสารสมัครหรือเข้าสู่เว็บไซต์เขตได้ทันที
                  </p>
                </div>
                <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-semibold ${
                  darkMode ? 'bg-amber-950/40 text-amber-300 border-amber-800' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <span className="material-symbols-outlined text-sm text-amber-500">star</span>
                  <span>ติดตามแล้ว {watchlist.length} เขต</span>
                </div>
              </div>

              <div className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {filteredDistricts.slice(0, visibleCount).map((d) => {
                  const isSaved = watchlist.includes(d.id);
                  const isLive = d.status === 'open' && d.applicants !== null;
                  const hasAnnouncedPositions = d.positions !== null;

                  return (
                    <div key={d.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className={`font-bold text-sm sm:text-base ${darkMode ? 'text-white' : 'text-slate-900'}`}>{d.name}</h3>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              d.type === 'สพม.' 
                                ? darkMode
                                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                                  : 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                                : darkMode
                                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                  : 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                            }`}>
                              {d.type}
                            </span>
                          </div>
                          <p className={`text-xs mt-0.5 flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            <span className="material-symbols-outlined text-xs text-slate-400">location_on</span>
                            จังหวัด {d.province} {d.contactPhone ? `• โทร. ${d.contactPhone}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleWatchlist(d.id)}
                            className={`p-1.5 rounded-xl transition-all ${
                              isSaved 
                                ? darkMode
                                  ? 'bg-amber-950/60 text-amber-400 border border-amber-700 shadow-xs'
                                  : 'bg-amber-50 text-amber-500 border border-amber-300 shadow-xs' 
                                : darkMode
                                  ? 'text-slate-500 hover:text-amber-400 hover:bg-slate-800'
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
                        <div className={`flex flex-wrap items-center justify-between gap-2 border rounded-xl px-3.5 py-2.5 mt-2.5 text-xs shadow-xs ${
                          darkMode
                            ? 'bg-gradient-to-r from-emerald-950/80 via-teal-950/70 to-emerald-950/80 border-emerald-800 text-emerald-200'
                            : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border border-emerald-200 text-emerald-950'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                            </span>
                            <span className={`font-extrabold text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-950'}`}>
                              เปิดรับสมัคร: {d.positions} อัตรา ({d.positions} ตำแหน่งว่าง)
                            </span>
                          </div>
                          <span className={`font-bold px-2.5 py-1 rounded-lg border text-[11px] shadow-xs ${
                            darkMode
                              ? 'bg-slate-900 border-emerald-700 text-emerald-300'
                              : 'bg-white border-emerald-200 text-emerald-900'
                          }`}>
                            {isLive ? `ผู้สมัคร ${d.applicants?.toLocaleString()} คน (1:${d.ratio})` : 'เปิดรับแล้ว (ประกาศตำแหน่งแล้ว)'}
                          </span>
                        </div>
                      ) : (
                        <div className={`flex items-center justify-between border rounded-xl px-3.5 py-2 mt-2.5 text-xs ${
                          darkMode
                            ? 'bg-slate-900/90 border-slate-800 text-slate-400'
                            : 'bg-slate-50 border border-slate-200 text-slate-600'
                        }`}>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-slate-400">schedule</span>
                            รอ อ.ก.ค.ศ. เขตพื้นที่สรุปและประกาศจำนวนตำแหน่งว่าง
                          </span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                            darkMode
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-white text-slate-500 border-slate-200'
                          }`}>
                            รอประกาศ
                          </span>
                        </div>
                      )}

                      {/* Jurisdiction Coverage (อำเภอที่รับผิดชอบ) */}
                      {d.jurisdiction && (
                        <div className={`mt-2 text-xs rounded-lg p-2 border ${
                          darkMode
                            ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                            : 'bg-slate-50 border-slate-200/80 text-slate-600'
                        }`}>
                          <span className={`font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>อำเภอในความรับผิดชอบ: </span>
                          <span>{d.jurisdiction}</span>
                          {d.headquarters && (
                            <span className={`ml-2 font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>
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
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs active:scale-95 transition-all border ${
                            darkMode
                              ? 'bg-slate-800 hover:bg-slate-700 text-blue-300 border-slate-700'
                              : 'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-200'
                          }`}
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
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs active:scale-95 transition-all border ${
                              darkMode
                                ? 'bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 border-indigo-800'
                                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-200'
                            }`}
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
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs active:scale-95 transition-all border ${
                              darkMode
                                ? 'bg-sky-950/60 hover:bg-sky-900 text-sky-300 border-sky-800'
                                : 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-200'
                            }`}
                            title={`สารสนเทศเขตพื้นที่การศึกษา สพฐ. (info.bopp.go.th)`}
                          >
                            <span className="material-symbols-outlined text-sm">database</span>
                            <span>BOPP</span>
                          </a>
                        )}
                        <button
                          onClick={() => setSelectedDistrictForDetails(d)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs active:scale-95 transition-all ml-auto border ${
                            darkMode
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                          }`}
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
                <div className={`pt-4 flex flex-wrap items-center justify-center gap-2 border-t mt-4 ${
                  darkMode ? 'border-slate-800' : 'border-slate-100'
                }`}>
                  <button
                    onClick={() => setVisibleCount((prev) => prev + 50)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs shadow-xs transition-all border ${
                      darkMode
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-blue-300'
                        : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900'
                    }`}
                  >
                    โหลดเขตพื้นที่เพิ่ม (+50 เขต)
                  </button>
                  <button
                    onClick={() => setVisibleCount(filteredDistricts.length)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs shadow-xs transition-all ${
                      darkMode
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
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
            <section className={`rounded-2xl p-5 border shadow-sm transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-blue-500 text-xl">school</span>
                    กลุ่มสาขาวิชาเอกหลักและจำนวนตำแหน่งว่างที่เปิดรับ (สพฐ.)
                  </h2>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    สรุปจำนวนโควตาตำแหน่งว่างที่ประกาศเปิดรับทั่วประเทศตามกลุ่มสาระการเรียนรู้
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  darkMode ? 'bg-blue-950 text-blue-300 border-blue-800' : 'bg-blue-100 text-blue-900 border-blue-200'
                }`}>
                  รอบทั่วไป 2569
                </span>
              </div>

              <div className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {majors.map((m, idx) => {
                  return (
                    <div key={m.id} className="py-3.5 flex items-center justify-between gap-2 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-black w-7 h-7 rounded-lg flex items-center justify-center border ${
                          darkMode ? 'bg-blue-950 text-blue-300 border-blue-800' : 'bg-blue-50 text-blue-600 border-blue-200'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <h3 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{m.name}</h3>
                          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>กลุ่มสาระ: {m.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {m.positions !== null ? (
                          <div>
                            <span className={`text-xs font-black px-2.5 py-1 rounded-lg border block ${
                              darkMode ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              เปิดรับ {m.positions.toLocaleString()} อัตรา
                            </span>
                            {m.applicants !== null && (
                              <span className={`text-[10px] font-semibold block mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                ผู้สมัคร {m.applicants.toLocaleString()} คน (1:{m.ratio})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                            darkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
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
            <div className={`flex items-center gap-2 p-1 rounded-2xl border shadow-xs transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <button
                onClick={() => setFeedSubTab('agencies')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  feedSubTab === 'agencies'
                    ? 'bg-blue-700 text-white shadow-xs shadow-blue-500/20'
                    : darkMode
                    ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
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
                    : darkMode
                    ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
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
                    : darkMode
                    ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
                    : 'text-slate-600 hover:text-blue-700 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-base">notifications</span>
                <span>ประกาศ สพฐ. ({feedItems.length})</span>
              </button>
            </div>

            {/* SUBTAB 1: OFFICIAL OBEC CENTRAL AGENCIES */}
            {feedSubTab === 'agencies' && (
              <section className={`rounded-2xl p-5 border shadow-sm space-y-4 transition-colors ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      <span className="material-symbols-outlined text-blue-500 text-xl">account_balance</span>
                      เว็บไซต์หน่วยงานในสังกัด สพฐ. ({centralAgencies.length} สำนัก/หน่วยงานส่วนกลาง)
                    </h2>
                    <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      ข้อมูลอย่างเป็นทางการจาก obec.go.th/th/agency-website เชื่อมต่อลิงก์ตรงทุกสำนัก
                    </p>
                  </div>
                  <a
                    href="https://www.obec.go.th/th/agency-website"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border font-bold transition-all ${
                      darkMode
                        ? 'text-blue-300 hover:text-blue-200 bg-blue-950/60 hover:bg-blue-900/60 border-blue-800'
                        : 'text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border-blue-200'
                    }`}
                  >
                    <span>เว็บไซต์หลัก สพฐ.</span>
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </a>
                </div>

                {/* Agency Search */}
                <div className={`flex items-center rounded-xl border px-3 py-2 gap-2 transition-all ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 focus-within:border-blue-400 focus-within:bg-slate-900'
                    : 'bg-slate-50 border-slate-200 focus-within:border-blue-500 focus-within:bg-white'
                }`}>
                  <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
                  <input
                    type="text"
                    className={`w-full bg-transparent outline-none text-xs ${
                      darkMode ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
                    }`}
                    placeholder="ค้นหาสำนัก เช่น บริหารงานบุคคล, นโยบายและแผน, ทดสอบทางการศึกษา..."
                    value={agencySearch}
                    onChange={(e) => setAgencySearch(e.target.value)}
                  />
                  {agencySearch && (
                    <button onClick={() => setAgencySearch('')} className="text-slate-400 hover:text-slate-200">
                      <span className="material-symbols-outlined text-xs">close</span>
                    </button>
                  )}
                </div>

                {/* Agency Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredAgencies.map((agency) => (
                    <div
                      key={agency.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                        darkMode
                          ? 'border-slate-800 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-700'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-white hover:border-blue-300 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            darkMode ? 'bg-blue-950 text-blue-300 border-blue-800' : 'bg-blue-100 text-blue-900 border-blue-200'
                          }`}>
                            {agency.category}
                          </span>
                        </div>
                        <h3 className={`font-bold text-xs sm:text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {agency.name}
                        </h3>
                        <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {agency.description}
                        </p>
                      </div>
                      <div className={`pt-3 mt-3 border-t flex items-center justify-between ${
                        darkMode ? 'border-slate-800' : 'border-slate-200/60'
                      }`}>
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
              <section className={`rounded-2xl p-5 border shadow-sm transition-colors ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-amber-500 filled text-xl">star</span>
                    เขตพื้นที่ในรายการติดตาม ({watchlist.length})
                  </h2>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    darkMode ? 'text-blue-300 bg-blue-950/60 border-blue-800' : 'text-blue-700 bg-blue-50 border-blue-200'
                  }`}>
                    ปักดาวเริ่มต้น: อุดรฯ & กทม.
                  </span>
                </div>
                <p className={`text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
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
                        className={`p-3.5 rounded-xl border text-xs shadow-xs space-y-2.5 transition-colors ${
                          darkMode
                            ? 'bg-gradient-to-r from-amber-950/30 via-slate-900 to-amber-950/30 border-amber-800/60 text-slate-300'
                            : 'bg-gradient-to-r from-amber-50/70 via-orange-50/50 to-amber-50/70 border-amber-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-sm block ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-800 border-amber-200'
                              }`}>
                                {item.type}
                              </span>
                            </div>
                            {item.positions !== null ? (
                              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-extrabold text-xs border ${
                                darkMode ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-emerald-100 text-emerald-900 border-emerald-200'
                              }`}>
                                <span className="material-symbols-outlined text-sm text-emerald-500">check_circle</span>
                                <span>เปิดรับสมัครจริง: {item.positions} อัตรา</span>
                              </div>
                            ) : (
                              <span className={`block ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>รอประกาศจำนวนตำแหน่ง</span>
                            )}
                            <span className={`block ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              จังหวัด {item.province} • {isLive ? `ผู้สมัคร: ${item.applicants?.toLocaleString()} คน (อัตรา 1:${item.ratio})` : `เปิดรับสมัครออนไลน์: ${OFFICIAL_OPEN_DATE_STR}`}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleWatchlist(wid)}
                            className="text-rose-500 hover:text-rose-400 font-bold hover:bg-rose-950/40 px-2.5 py-1 rounded-lg transition-all border border-rose-300 dark:border-rose-800 text-xs shrink-0"
                          >
                            ยกเลิกติดตาม
                          </button>
                        </div>

                        {/* Direct Links in Watchlist */}
                        <div className={`flex flex-wrap items-center gap-2 pt-1 border-t ${
                          darkMode ? 'border-amber-900/40' : 'border-amber-200/60'
                        }`}>
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
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-xs transition-all ${
                              darkMode
                                ? 'bg-slate-800 hover:bg-slate-700 text-blue-300 border-slate-700'
                                : 'bg-white hover:bg-slate-50 text-blue-900 border-slate-300'
                            }`}
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                            <span>เข้าเว็บเขต</span>
                          </a>
                          {item.ibnsUrl && (
                            <a
                              href={item.ibnsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-xs transition-all ${
                                darkMode
                                  ? 'bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 border-indigo-800'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-200'
                              }`}
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
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-xs transition-all ${
                                darkMode
                                  ? 'bg-sky-950/60 hover:bg-sky-900 text-sky-300 border-sky-800'
                                  : 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-200'
                              }`}
                            >
                              <span className="material-symbols-outlined text-sm">database</span>
                              <span>BOPP</span>
                            </a>
                          )}
                          <button
                            onClick={() => setSelectedDistrictForDetails(item)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold text-xs ml-auto border ${
                              darkMode
                                ? 'bg-amber-950/60 hover:bg-amber-900 text-amber-300 border-amber-800'
                                : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-transparent'
                            }`}
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
              <section className={`rounded-2xl p-5 border shadow-sm transition-colors ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h2 className={`text-base font-bold flex items-center gap-2 mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <span className="material-symbols-outlined text-blue-500 text-xl">notifications_active</span>
                  ประกาศและสถานะทางการ (สพฐ.)
                </h2>
                <p className={`text-xs mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>รวบรวมประกาศอย่างเป็นทางการที่ผ่านการตรวจสอบแล้ว</p>

                <div className="space-y-3">
                  {feedItems.map((feed) => (
                    <div key={feed.id} className={`p-3.5 rounded-xl border transition-all ${
                      darkMode ? 'border-slate-800 bg-slate-800/50 hover:bg-slate-800' : 'border-slate-200 bg-slate-50/70 hover:bg-white'
                    }`}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className={`flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          <span className="material-symbols-outlined text-xs">schedule</span>
                          {feed.timestamp}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                          darkMode ? 'bg-blue-950 text-blue-300 border-blue-800' : 'bg-blue-100 text-blue-900 border-blue-200'
                        }`}>
                          {feed.source}
                        </span>
                      </div>
                      <h3 className={`font-bold text-sm ${darkMode ? 'text-blue-300' : 'text-blue-950'}`}>{feed.title}</h3>
                      <p className={`text-xs mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{feed.message}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className={`rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border p-5 space-y-4 transition-colors ${
            darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className={`flex items-start justify-between gap-3 pb-3 border-b ${
              darkMode ? 'border-slate-800' : 'border-slate-100'
            }`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    selectedDistrictForDetails.type === 'สพม.' 
                      ? darkMode
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                        : 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                      : darkMode
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                  }`}>
                    {selectedDistrictForDetails.type}
                  </span>
                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    จังหวัด {selectedDistrictForDetails.province}
                  </span>
                </div>
                <h3 className={`text-lg font-bold mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {selectedDistrictForDetails.name}
                </h3>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)
                </p>
              </div>
              <button
                onClick={() => setSelectedDistrictForDetails(null)}
                className={`p-1.5 rounded-xl transition-all ${
                  darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
                aria-label="ปิดหน้าต่าง"
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            {/* Vacancy Callout in Modal */}
            {selectedDistrictForDetails.positions !== null ? (
              <div className={`p-3.5 rounded-xl border text-xs ${
                darkMode
                  ? 'bg-gradient-to-r from-emerald-950/80 to-teal-950/70 border-emerald-800 text-emerald-200'
                  : 'bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-slate-800'
              }`}>
                <div className={`flex items-center gap-2 font-extrabold text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-900'}`}>
                  <span className="material-symbols-outlined text-emerald-500">assignment_turned_in</span>
                  <span>เปิดรับสมัครจริง: {selectedDistrictForDetails.positions} อัตรา ({selectedDistrictForDetails.positions} ตำแหน่งว่าง)</span>
                </div>
                <p className={`mt-1 ${darkMode ? 'text-emerald-300/80' : 'text-emerald-800'}`}>
                  อ.ก.ค.ศ. เขตพื้นที่การศึกษาได้ออกประกาศรายละเอียดตำแหน่งว่างและวิชาเอกอย่างเป็นทางการแล้ว
                </p>
              </div>
            ) : (
              <div className={`p-3 rounded-xl border text-xs ${
                darkMode ? 'bg-slate-800/80 border-slate-700 text-slate-400' : 'bg-slate-50 border border-slate-200 text-slate-600'
              }`}>
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
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border font-bold text-sm active:scale-98 transition-all ${
                  darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-blue-300'
                    : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:bg-blue-100 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                    <span className="material-symbols-outlined text-xl">open_in_new</span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm">เข้าสู่เว็บไซต์ทางการ สพฐ. ประจำเขต</div>
                    <div className={`text-[11px] font-normal ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {selectedDistrictForDetails.websiteUrl}
                    </div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-lg text-blue-500">launch</span>
              </a>

              {selectedDistrictForDetails.ibnsUrl && (
                <a
                  href={selectedDistrictForDetails.ibnsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border font-bold text-sm active:scale-98 transition-all ${
                    darkMode
                      ? 'bg-indigo-950/60 hover:bg-indigo-900 border-indigo-800 text-indigo-300'
                      : 'bg-gradient-to-r from-indigo-50 to-blue-50 hover:bg-indigo-100 border-indigo-200 text-indigo-950'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-700 text-white flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl">lan</span>
                    </div>
                    <div className="text-left">
                      <div className="text-sm">ระบบสารสนเทศ สพฐ. IBNS (พอร์ทัลเขต)</div>
                      <div className={`text-[11px] font-normal ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>
                        {selectedDistrictForDetails.ibnsUrl}
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-lg text-indigo-400">launch</span>
                </a>
              )}

              {selectedDistrictForDetails.boppUrl && (
                <a
                  href={selectedDistrictForDetails.boppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border font-bold text-sm active:scale-98 transition-all ${
                    darkMode
                      ? 'bg-sky-950/60 hover:bg-sky-900 border-sky-800 text-sky-300'
                      : 'bg-gradient-to-r from-sky-50 to-blue-50 hover:bg-sky-100 border-sky-200 text-sky-950'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl">database</span>
                    </div>
                    <div className="text-left">
                      <div className="text-sm">สารสนเทศเขตพื้นที่การศึกษา สพฐ. (BOPP)</div>
                      <div className={`text-[11px] font-normal ${darkMode ? 'text-sky-400' : 'text-sky-700'}`}>
                        {selectedDistrictForDetails.boppUrl}
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-lg text-sky-400">launch</span>
                </a>
              )}
            </div>

            {/* Jurisdiction Coverage Callout */}
            {selectedDistrictForDetails.jurisdiction && (
              <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`font-bold flex items-center gap-1.5 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  <span className="material-symbols-outlined text-sm text-blue-500">map</span>
                  <span>ขอบเขตพื้นที่และอำเภอที่รับผิดชอบ:</span>
                </div>
                <p className={`leading-relaxed pl-5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {selectedDistrictForDetails.jurisdiction}
                </p>
                {selectedDistrictForDetails.headquarters && (
                  <p className={`font-semibold pl-5 pt-1 ${darkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                    ที่ตั้งสำนักงานเขต: อำเภอ{selectedDistrictForDetails.headquarters}
                  </p>
                )}
                {selectedDistrictForDetails.formerCode && (
                  <p className={`pl-5 text-[11px] ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                    เดิมคือ: {selectedDistrictForDetails.formerCode}
                  </p>
                )}
              </div>
            )}

            {/* Contact Phone if available */}
            {selectedDistrictForDetails.contactPhone && (
              <div className={`flex items-center justify-between p-3 rounded-xl border text-xs ${
                darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border border-slate-200'
              }`}>
                <div className={`flex items-center gap-2 font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span className="material-symbols-outlined text-base text-blue-500">call</span>
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
            <div className={`rounded-xl border p-4 space-y-2 ${
              darkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50/60 border-slate-200'
            }`}>
              <h4 className={`font-bold text-xs flex items-center gap-1.5 ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                <span className="material-symbols-outlined text-base text-blue-500">task</span>
                รายการเอกสารหลักฐานที่ต้องเตรียมในการสมัคร:
              </h4>
              <ul className={`text-xs space-y-1.5 list-none pl-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {[
                  '1. ใบสมัครสอบแข่งขันครูผู้ช่วย (พิมพ์ออกจากระบบรับสมัครออนไลน์)',
                  '2. รูปถ่ายหน้าตรงไม่สวมหมวกและแว่นตาดำ ถ่ายไว้ไม่เกิน 6 เดือน ขนาด 1 x 1.5 นิ้ว',
                  '3. ปริญญาบัตร หรือหนังสือรับรองคุณวุฒิ และใบรายงานผลการศึกษา (Transcript)',
                  '4. ใบอนุญาตประกอบวิชาชีพครู หรือหลักฐานรับรองสิทธิจากคุรุสภา (ยังไม่หมดอายุในวันปิดรับสมัคร)',
                  '5. สำเนาบัตรประจำตัวประชาชน และสำเนาทะเบียนบ้าน',
                  '6. ใบรับรองแพทย์จากสถานพยาบาลของรัฐ (ออกไว้ไม่เกิน 1 เดือน นับถึงวันสมัคร)',
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-emerald-500 text-sm mt-0.5">check_circle</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Critical Note */}
            <div className={`rounded-xl border p-3 text-xs space-y-1 ${
              darkMode
                ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-amber-500">warning</span>
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
                className={`w-full sm:w-auto px-5 py-2 rounded-xl font-bold text-xs transition-all ${
                  darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                }`}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Bottom Navigation Bar */}
      <nav aria-label="แถบการนำทางหลัก" className={`fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-3 py-2 max-w-screen-md mx-auto backdrop-blur-md shadow-lg border-t transition-colors ${
        darkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200'
      }`}>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'dashboard'
              ? 'bg-gradient-to-r from-blue-700 to-indigo-700 text-white font-bold shadow-md shadow-blue-500/20'
              : darkMode
              ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
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
              : darkMode
              ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
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
              : darkMode
              ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
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
              : darkMode
              ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
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
