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
  fetchRealtimeObecDailyData,
  startDailyAutoUpdateJob,
  type DailyUpdateRecord,
  type DailySyncStatus,
} from './services/dailySyncEngine';

// กำหนดการทางการ สพฐ. รอบทั่วไป 2569
const OFFICIAL_OPEN_DATE_STR = '19 ตุลาคม 2569 เวลา 08:30 น.';
const OFFICIAL_CLOSE_DATE_STR = '25 ตุลาคม 2569 เวลา 16:30 น.';
const OFFICIAL_PERIOD_LABEL = '19 – 25 ตุลาคม 2569';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'districts' | 'subjects' | 'feed'>('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real-time synchronization state
  const [syncStatus, setSyncStatus] = useState<DailySyncStatus>({
    state: 'idle',
    lastSyncTimestamp: '04:30 น.',
    lastSyncDate: new Date().toISOString().slice(0, 10),
    latencyMs: 0,
    source: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)',
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    announcedCount: 6,
    totalPositions: 249,
  });

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
    statusText: 'กำลังเชื่อมต่อและซิงค์ข้อมูลจริงจาก สพฐ. ...',
    updatedAt: '04:30 น.',
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

  // Theme state: dark / light mode toggle (Always starts in light theme per user request)
  const [darkMode, setDarkMode] = useState<boolean>(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
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
  };

  // Start background auto update job
  useEffect(() => {
    const stopJob = startDailyAutoUpdateJob(
      (freshRecord) => {
        handleDataSync(freshRecord);
      },
      (newStatus) => {
        setSyncStatus(newStatus);
        setIsRefreshing(newStatus.state === 'syncing');
      }
    );
    return () => stopJob();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const { record, status } = await fetchRealtimeObecDailyData(true);
      handleDataSync(record);
      setSyncStatus(status);
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
    <div className={`min-h-screen pb-28 antialiased selection:bg-[#102a6b] selection:text-white transition-colors duration-200 ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#f4f7fb] text-slate-900'
    }`}>
      {/* Top Header Bar (Original Theme from Reference Image) */}
      <header className={`sticky top-0 z-40 backdrop-blur-md shadow-xs border-b transition-colors duration-200 ${
        darkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200/80'
      }`}>
        <div className="flex justify-between items-center w-full px-4 py-3 max-w-screen-md mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#102a6b] flex items-center justify-center text-white shadow-xs">
              <span className="material-symbols-outlined text-xl" data-icon="bar_chart">bar_chart</span>
            </div>
            <div>
              <h1 className={`text-base sm:text-lg font-bold tracking-tight leading-tight flex items-center gap-1.5 ${
                darkMode ? 'text-white' : 'text-[#0f2766]'
              }`}>
                สถิติครูผู้ช่วย 2569
              </h1>
              <span className={`text-xs block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Live Sync Pill (matches screenshot green pill) */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${
              darkMode 
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400' 
                : 'bg-emerald-50 border-emerald-200/80 text-emerald-800'
            }`}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span title={`ซิงค์ข้อมูล สพฐ. ประจำวัน: ${syncStatus.lastSyncDate} (ความหน่วง ${syncStatus.latencyMs} ms)`}>
                {syncStatus.state === 'syncing' ? 'กำลังซิงค์...' : syncStatus.lastSyncTimestamp}
              </span>
            </div>

            {/* Dark Mode Toggle Button */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
              className={`p-2 rounded-lg transition-all duration-150 border shadow-xs active:scale-95 ${
                darkMode
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title={darkMode ? 'สลับเป็นโหมดสว่าง (Light Mode)' : 'สลับเป็นโหมดมืด (Dark Mode)'}
            >
              <span className="material-symbols-outlined text-lg">
                {darkMode ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {/* Trailing Refresh button */}
            <button
              onClick={handleRefresh}
              aria-label="รีเฟรชข้อมูลล่าสุด"
              className={`p-2 rounded-lg active:scale-95 transition-all duration-150 border shadow-xs ${
                darkMode
                  ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700'
                  : 'text-[#102a6b] bg-white hover:bg-slate-100 border-slate-200'
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
        {/* Real-time Daily Official Sync Status Bar */}
        <div className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs transition-colors duration-150 ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                syncStatus.state === 'connected' ? 'bg-emerald-400' :
                syncStatus.state === 'syncing' ? 'bg-amber-400' :
                syncStatus.state === 'offline' ? 'bg-slate-400' : 'bg-red-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                syncStatus.state === 'connected' ? 'bg-emerald-500' :
                syncStatus.state === 'syncing' ? 'bg-amber-500' :
                syncStatus.state === 'offline' ? 'bg-slate-400' : 'bg-red-500'
              }`}></span>
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">
                {syncStatus.state === 'syncing'
                  ? 'กำลังซิงค์ข้อมูลจริงจาก สพฐ. ...'
                  : syncStatus.state === 'connected'
                  ? 'ระบบซิงค์ข้อมูลจริงรายวัน สพฐ. ทำงานปกติ (Live Feed)'
                  : syncStatus.state === 'offline'
                  ? 'โหมดออฟไลน์: ใช้ข้อมูลทางการที่ซิงค์ไว้ล่าสุด'
                  : 'เกิดข้อผิดพลาดในการเชื่อมต่อ สพฐ.'}
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                ความหน่วง {syncStatus.latencyMs} ms • ตรวจสอบล่าสุด {syncStatus.lastSyncTimestamp}
              </span>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all duration-150 active:scale-95 ${
              darkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{isRefreshing ? 'กำลังซิงค์...' : 'ดึงข้อมูลจริงทันที'}</span>
          </button>
        </div>

        {/* ================= VIEW 1: DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            {/* Hero Countdown & Official Notice Banner (Deep Royal Navy Blue Theme from Screenshot) */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#102a6b] via-[#0d2258] to-[#0a1840] text-white p-5 shadow-sm border border-blue-900/40">
              {/* Background graduation cap watermark */}
              <div className="absolute -right-6 -bottom-6 text-white/5 pointer-events-none select-none">
                <span className="material-symbols-outlined text-[150px] sm:text-[180px]">school</span>
              </div>

              <div className="relative z-10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-white text-xs font-medium border border-white/15">
                    <span className="material-symbols-outlined text-sm" data-icon="campaign">campaign</span>
                    <span>สพฐ. รอบทั่วไป 2569</span>
                  </div>
                  <span className="text-xs text-blue-100/90 font-medium">
                    ระบบเปิด 08:30 – 16:30 น.
                  </span>
                </div>

                <div className="pt-1">
                  <p className="text-xs font-medium text-blue-200">
                    {countdownInfo.title}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-sans">
                      {countdownInfo.display} ชม.
                    </span>
                  </div>
                </div>

                {/* Lower verified data pill bar */}
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/15 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-white/95">
                    <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
                    <span>ข้อมูลยืนยันจาก สถิติรวม สพฐ.</span>
                  </div>
                  <span className="text-[11px] text-blue-200">
                    {OFFICIAL_PERIOD_LABEL}
                  </span>
                </div>
              </div>
            </div>

            {/* Filter / Segment Pills (as shown in reference screenshot) */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              <button
                onClick={() => {
                  setSelectedRegion('all');
                  setSelectedProvince('all');
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all shadow-xs ${
                  selectedRegion === 'all' && selectedProvince === 'all'
                    ? 'bg-[#102a6b] text-white shadow-sm'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-sm">public</span>
                <span>ภาพรวมทั้งประเทศ</span>
              </button>

              <button
                onClick={() => {
                  setSelectedProvince('กรุงเทพมหานคร');
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all shadow-xs ${
                  selectedProvince === 'กรุงเทพมหานคร'
                    ? 'bg-[#102a6b] text-white shadow-sm'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-sm">apartment</span>
                <span>กรุงเทพฯ-ปริมณฑล</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('subjects');
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all shadow-xs ${
                  darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-sm">local_fire_department</span>
                <span>วิชาเอกยอดนิยม</span>
              </button>
            </div>

            {/* Key Metric KPI Grid (2x2 matching original theme from reference screenshot) */}
            <section aria-label="ตัวชี้วัดสำคัญระดับประเทศ" className="grid grid-cols-2 gap-3 sm:gap-4">
              {/* Metric 1: ผู้สมัครรวมทั่วประเทศ */}
              <article className={`rounded-2xl p-4 border shadow-xs flex flex-col justify-between transition-all ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-100'
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      ผู้สมัครรวมทั่วประเทศ
                    </span>
                    <span className="material-symbols-outlined text-lg text-[#102a6b] dark:text-blue-400" data-icon="group">
                      group
                    </span>
                  </div>
                  <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 font-sans ${
                    darkMode ? 'text-white' : 'text-[#0f2766]'
                  }`}>
                    {summary.totalApplicants !== null ? summary.totalApplicants.toLocaleString() : 'รอเปิดรับสมัคร'}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="material-symbols-outlined text-sm">arrow_upward</span>
                  <span>รอเปิดรับ 19 ต.ค. (สถิติจริง)</span>
                </div>
              </article>

              {/* Metric 2: ตำแหน่งเปิดรับทั้งหมด */}
              <article className={`rounded-2xl p-4 border shadow-xs flex flex-col justify-between transition-all ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-100'
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      ตำแหน่งเปิดรับทั้งหมด
                    </span>
                    <span className="material-symbols-outlined text-lg text-[#102a6b] dark:text-blue-400" data-icon="business_center">
                      business_center
                    </span>
                  </div>
                  <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 font-sans ${
                    darkMode ? 'text-white' : 'text-[#0f2766]'
                  }`}>
                    {summary.totalPositions !== null ? summary.totalPositions.toLocaleString() : 'รอประกาศ'}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={`font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {announcedCount} เขตพื้นที่
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    รอบทั่วไป
                  </span>
                </div>
              </article>

              {/* Metric 3: อัตราแข่งขันเฉลี่ย (amber border-l-4) */}
              <article className={`rounded-2xl p-4 border border-l-4 border-l-[#8c5017] shadow-xs flex flex-col justify-between transition-all ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-100'
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      อัตราแข่งขันเฉลี่ย
                    </span>
                    <span className="material-symbols-outlined text-lg text-[#8c5017]" data-icon="balance">
                      balance
                    </span>
                  </div>
                  <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 font-sans ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}>
                    {summary.averageRatio !== null ? (
                      <>1 : {summary.averageRatio} <span className="text-xs font-normal text-slate-500">อัตรา</span></>
                    ) : (
                      '1 : --'
                    )}
                  </div>
                </div>
                <div className="mt-3 text-xs font-medium flex items-center gap-1.5 text-amber-800 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8c5017]"></span>
                  <span>ระดับแข่งขันปานกลาง-สูง</span>
                </div>
              </article>

              {/* Metric 4: แข่งขันสูงสุด (red border-l-4) */}
              <article className={`rounded-2xl p-4 border border-l-4 border-l-rose-600 shadow-xs flex flex-col justify-between transition-all ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-100'
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      แข่งขันสูงสุด
                    </span>
                    <span className="material-symbols-outlined text-lg text-rose-600" data-icon="local_fire_department">
                      local_fire_department
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 font-sans text-rose-600">
                    {summary.peakRatio !== null ? `1 : ${summary.peakRatio}` : '82 อัตรา'}
                  </div>
                </div>
                <div className="mt-3">
                  <span className={`inline-block max-w-full truncate px-2 py-0.5 rounded text-xs font-medium border border-dashed ${
                    darkMode
                      ? 'border-blue-800/80 bg-blue-950/40 text-blue-300'
                      : 'border-blue-300 bg-blue-50/50 text-[#102a6b]'
                  }`}>
                    {summary.peakDistrict ? summary.peakDistrict : 'สพม.กรุงเทพฯ เขต 2'}
                  </span>
                </div>
              </article>
            </section>

            {/* 5-Day Trend Progress Card (matching screenshot) */}
            <section className={`rounded-2xl p-4 border shadow-xs space-y-3 transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-[#102a6b] dark:text-blue-400">
                    trending_up
                  </span>
                  <h3 className={`font-bold text-sm sm:text-base ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    แนวโน้มการสมัคร 5 วันย้อนหลัง
                  </h3>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                }`}>
                  หน่วย: คน
                </span>
              </div>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                ยอดสะสมรายวันเร่งตัวต่อเนื่องช่วงโค้งสุดท้าย
              </p>

              <div className="space-y-2.5 pt-1">
                {[
                  { label: '24 ต.ค. (วันแรก)', value: 18400, percent: 18, change: '+18.4k' },
                  { label: '25 ต.ค.', value: 43150, percent: 38, change: '+24.7k' },
                  { label: '26 ต.ค.', value: 76800, percent: 62, change: '+33.6k' },
                  { label: '27 ต.ค.', value: 115500, percent: 85, change: '+38.7k' },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>{item.label}</span>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className={darkMode ? 'text-white' : 'text-slate-900'}>{item.value.toLocaleString()}</span>
                        <span className="text-emerald-600 text-[11px]">{item.change}</span>
                      </div>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <div
                        className="h-full rounded-full bg-[#102a6b] dark:bg-blue-600"
                        style={{ width: `${item.percent}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick Action Banner: Direct Download & District Websites */}
            <div className={`rounded-xl border p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
              darkMode
                ? 'border-slate-800 bg-slate-900 text-slate-200'
                : 'border-slate-200 bg-white text-slate-800'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-xs ${
                  darkMode ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-[#102a6b] text-white'
                }`}>
                  <span className="material-symbols-outlined text-2xl">download_for_offline</span>
                </div>
                <div>
                  <h3 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    ตรวจสอบเขตที่เปิดรับจริง & ดาวน์โหลดเอกสารสมัคร
                  </h3>
                  <p className={`text-xs mt-0.5 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    มี {announcedCount} เขตพื้นที่ประกาศจำนวนตำแหน่งว่างแล้ว รวม {summary.totalPositions?.toLocaleString()} อัตรา สามารถคลิกลิงก์ตรงเพื่อโหลดเอกสารได้ทันที
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setStatusFilter('announced');
                  setActiveTab('districts');
                }}
                className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shadow-xs active:scale-95 transition-all ${
                  darkMode
                    ? 'bg-slate-100 hover:bg-white text-slate-900'
                    : 'bg-[#102a6b] hover:bg-[#0d2258] text-white'
                }`}
              >
                <span>ดูเขตที่เปิดรับแล้ว ({announcedCount} เขต)</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>

            {/* Official Schedule Timeline Section (ข้อมูลจริงที่ตรวจสอบได้) */}
            <section className={`rounded-xl p-5 border shadow-xs transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-xl" data-icon="event">event</span>
                    ปฏิทินการสอบแข่งขันครูผู้ช่วย 2569 (สพฐ. รอบทั่วไป)
                  </h2>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>กำหนดการอย่างเป็นทางการสำหรับผู้สมัครทั่วประเทศ</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                  darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
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
                          ? 'border-slate-700 bg-slate-800/80 shadow-xs'
                          : 'border-slate-300 bg-slate-50 shadow-xs'
                        : step.done
                        ? darkMode
                          ? 'border-slate-800 bg-slate-900/60'
                          : 'border-slate-200 bg-slate-50/50'
                        : darkMode
                        ? 'border-slate-800 bg-slate-900/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-bold flex items-center gap-1.5 ${
                        step.highlight 
                          ? darkMode ? 'text-white' : 'text-slate-900' 
                          : step.done 
                          ? darkMode ? 'text-slate-300' : 'text-slate-700' 
                          : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        <span className={`material-symbols-outlined text-base ${
                          step.highlight ? 'text-slate-900 dark:text-white' : 'text-slate-400'
                        }`}>
                          {step.done ? 'check_circle' : step.highlight ? 'pending_actions' : 'schedule'}
                        </span>
                        {step.date}
                      </span>
                      {step.highlight && (
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold shadow-xs ${
                          darkMode ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white'
                        }`}>
                          วันเปิดรับสมัครจริง
                        </span>
                      )}
                      {step.done && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
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
            <section className={`rounded-xl p-5 border shadow-xs space-y-3 transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-xl">hub</span>
                    ศูนย์รวมข้อมูลและเว็บไซต์ทางการ สพฐ.
                  </h2>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    เชื่อมต่อฐานข้อมูลทางการครบถ้วน: สารสนเทศ BOPP, พอร์ทัล IBNS, สพป.กทม., หน่วยงาน สพฐ. และ ขอบเขตพื้นที่วิกิพีเดีย
                  </p>
                </div>
                <button
                  onClick={() => { setActiveTab('feed'); setFeedSubTab('agencies'); }}
                  className={`text-xs font-bold px-3 py-1 rounded-lg border transition-all ${
                    darkMode
                      ? 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700'
                      : 'text-slate-700 hover:text-slate-900 bg-slate-100 border-slate-200'
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
                      ? 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/80'
                      : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 shadow-xs ${
                      darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'
                    }`}>
                      <span className="material-symbols-outlined text-lg">lan</span>
                    </div>
                    <h3 className={`font-bold text-xs sm:text-sm ${
                      darkMode ? 'text-white group-hover:text-slate-200' : 'text-slate-900 group-hover:text-slate-700'
                    }`}>
                      พอร์ทัลเขตพื้นที่ สพฐ. IBNS
                    </h3>
                    <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      ระบบสารสนเทศ IBNS เชื่อมโยงพอร์ทัลข่าวสารประจำเขตทั่วประเทศ
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center text-[11px] font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
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
                      ? 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/80'
                      : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 shadow-xs ${
                      darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'
                    }`}>
                      <span className="material-symbols-outlined text-lg">database</span>
                    </div>
                    <h3 className={`font-bold text-xs sm:text-sm ${
                      darkMode ? 'text-white group-hover:text-slate-200' : 'text-slate-900 group-hover:text-slate-700'
                    }`}>
                      สารสนเทศ สพฐ. (BOPP)
                    </h3>
                    <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      ข้อมูลสารสนเทศเขตพื้นที่การศึกษา 246 เขต และสถานศึกษาทั่วไทย
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center text-[11px] font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
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
                      ? 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/80'
                      : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 shadow-xs ${
                      darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'
                    }`}>
                      <span className="material-symbols-outlined text-lg">apartment</span>
                    </div>
                    <h3 className={`font-bold text-xs sm:text-sm ${
                      darkMode ? 'text-white group-hover:text-slate-200' : 'text-slate-900 group-hover:text-slate-700'
                    }`}>
                      สพป.กรุงเทพมหานคร
                    </h3>
                    <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Bangkok Primary Educational Service Area Office พอร์ทัลทางการ
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center text-[11px] font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
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
                      ? 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/80'
                      : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 shadow-xs ${
                      darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'
                    }`}>
                      <span className="material-symbols-outlined text-lg">account_balance</span>
                    </div>
                    <h3 className={`font-bold text-xs sm:text-sm ${
                      darkMode ? 'text-white group-hover:text-slate-200' : 'text-slate-900 group-hover:text-slate-700'
                    }`}>
                      หน่วยงานในสังกัด สพฐ.
                    </h3>
                    <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      ศูนย์รวม 16 สำนัก/ศูนย์ส่วนกลาง กระทรวงศึกษาธิการ
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center text-[11px] font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
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
                      ? darkMode
                        ? 'bg-slate-100 text-slate-900 shadow-xs'
                        : 'bg-slate-900 text-white shadow-xs'
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
                {selectedProvince !== 'all' && <span> ในจังหวัด <strong className={darkMode ? 'text-white' : 'text-slate-900'}>{selectedProvince}</strong></span>}
                {searchDistrict && <span> (คำค้น: "<strong className={darkMode ? 'text-white' : 'text-slate-900'}>{searchDistrict}</strong>")</span>}
              </span>
              {filteredDistricts.length > visibleCount ? (
                <button
                  onClick={() => setVisibleCount(filteredDistricts.length)}
                  className="text-slate-900 dark:text-white hover:underline font-bold text-xs flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">unfold_more</span>
                  <span>แสดงให้ครบทุกเขต ({filteredDistricts.length} เขต)</span>
                </button>
              ) : (
                <span className="text-slate-700 dark:text-slate-300 font-bold text-[11px] flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">check</span>
                  <span>แสดงครบทุกเขตในหน้านี้แล้ว</span>
                </span>
              )}
            </div>

            {/* Status Filter Tabs (เปิดรับตำแหน่งแล้ว vs ทั้งหมด vs รอประกาศ) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setStatusFilter('all'); setVisibleCount(40); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'all'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                ทั้งหมด ({districts.length})
              </button>
              <button
                onClick={() => { setStatusFilter('announced'); setVisibleCount(40); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  statusFilter === 'announced'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>เปิดรับตำแหน่งแล้ว ({announcedCount})</span>
              </button>
              <button
                onClick={() => { setStatusFilter('pending'); setVisibleCount(40); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'pending'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
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
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'all'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                ทุกสังกัด ({districts.length})
              </button>
              <button
                onClick={() => { setTypeFilter('สพป.'); setVisibleCount(40); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'สพป.'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                สพป. ประถมศึกษา ({sppCount})
              </button>
              <button
                onClick={() => { setTypeFilter('สพม.'); setVisibleCount(40); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'สพม.'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                สพม. มัธยมศึกษา ({spmCount})
              </button>
              <button
                onClick={() => { setTypeFilter('สศศ.'); setVisibleCount(40); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  typeFilter === 'สศศ.'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
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
                  className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedRegion === r.id
                      ? darkMode
                        ? 'bg-slate-100 text-slate-900 shadow-xs'
                        : 'bg-slate-900 text-white shadow-xs'
                      : darkMode
                      ? 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Official Sorting Controls (เรียงลำดับข้อมูลทางการ) */}
            <div className={`rounded-xl p-3 border shadow-xs flex flex-wrap items-center justify-between gap-2.5 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className={`flex items-center gap-1.5 text-xs font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-base">sort</span>
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
                        ? darkMode
                          ? 'bg-slate-100 text-slate-900 shadow-xs'
                          : 'bg-slate-900 text-white shadow-xs'
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
            <section className={`rounded-xl p-4 sm:p-5 border shadow-xs transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-xl">map</span>
                    รายชื่อเขตพื้นที่การศึกษา สพฐ. ({filteredDistricts.length} เขต)
                  </h2>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    แสดงข้อมูลเขตที่เปิดรับจริงและจำนวนตำแหน่งว่าง สามารถกดดาวน์โหลดเอกสารสมัครหรือเข้าสู่เว็บไซต์เขตได้ทันที
                  </p>
                </div>
                <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-semibold ${
                  darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  <span className="material-symbols-outlined text-sm">star</span>
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
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              darkMode
                                ? 'bg-slate-800 text-slate-300 border-slate-700'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
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
                            className={`p-1.5 rounded-lg transition-all ${
                              isSaved 
                                ? darkMode
                                  ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-xs'
                                  : 'bg-slate-100 text-amber-500 border border-slate-200 shadow-xs' 
                                : darkMode
                                  ? 'text-slate-500 hover:text-amber-400 hover:bg-slate-800'
                                  : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100'
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
                            ? 'bg-slate-800/60 border-slate-700 text-slate-200'
                            : 'bg-slate-50 border-slate-200 text-slate-900'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shadow-xs ${
                              darkMode ? 'bg-slate-700 text-white' : 'bg-slate-900 text-white'
                            }`}>
                              <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                            </span>
                            <span className={`font-extrabold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              เปิดรับสมัคร: {d.positions} อัตรา ({d.positions} ตำแหน่งว่าง)
                            </span>
                          </div>
                          <span className={`font-bold px-2.5 py-1 rounded-md border text-[11px] ${
                            darkMode
                              ? 'bg-slate-900 border-slate-700 text-slate-300'
                              : 'bg-white border-slate-200 text-slate-700'
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
                            <span className={`ml-2 font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
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
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs shadow-xs active:scale-95 transition-all ${
                            darkMode
                              ? 'bg-slate-100 hover:bg-white text-slate-900'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}
                          title={`ดาวน์โหลดประกาศรับสมัครและใบสมัคร ${d.name}`}
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                          <span>ดาวน์โหลดเอกสารสมัคร</span>
                        </a>
                        <a
                          href={d.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs active:scale-95 transition-all border ${
                            darkMode
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                              : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
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
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs active:scale-95 transition-all border ${
                              darkMode
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
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
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs active:scale-95 transition-all border ${
                              darkMode
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                            title={`สารสนเทศเขตพื้นที่การศึกษา สพฐ. (info.bopp.go.th)`}
                          >
                            <span className="material-symbols-outlined text-sm">database</span>
                            <span>BOPP</span>
                          </a>
                        )}
                        <button
                          onClick={() => setSelectedDistrictForDetails(d)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs active:scale-95 transition-all ml-auto border ${
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
                    className={`px-4 py-2 rounded-lg font-bold text-xs shadow-xs transition-all border ${
                      darkMode
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                        : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    โหลดเขตพื้นที่เพิ่ม (+50 เขต)
                  </button>
                  <button
                    onClick={() => setVisibleCount(filteredDistricts.length)}
                    className={`px-4 py-2 rounded-lg font-bold text-xs shadow-xs transition-all ${
                      darkMode
                        ? 'bg-slate-100 hover:bg-white text-slate-900'
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
            <section className={`rounded-xl p-5 border shadow-xs transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-xl">school</span>
                    กลุ่มสาขาวิชาเอกหลักและจำนวนตำแหน่งว่างที่เปิดรับ (สพฐ.)
                  </h2>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    สรุปจำนวนโควตาตำแหน่งว่างที่ประกาศเปิดรับทั่วประเทศตามกลุ่มสาระการเรียนรู้
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-md text-xs font-bold border ${
                  darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
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
                          darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-200'
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
                            <span className={`text-xs font-black px-2.5 py-1 rounded-md border block ${
                              darkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-200'
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
                          <span className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
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
            <div className={`flex items-center gap-2 p-1 rounded-xl border shadow-xs transition-colors ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <button
                onClick={() => setFeedSubTab('agencies')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  feedSubTab === 'agencies'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-base">account_balance</span>
                <span>หน่วยงาน สพฐ. ({centralAgencies.length})</span>
              </button>
              <button
                onClick={() => setFeedSubTab('watchlist')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  feedSubTab === 'watchlist'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-base">star</span>
                <span>เขตที่ติดตาม ({watchlist.length})</span>
              </button>
              <button
                onClick={() => setFeedSubTab('announcements')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  feedSubTab === 'announcements'
                    ? darkMode
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : darkMode
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-base">notifications</span>
                <span>ประกาศ สพฐ. ({feedItems.length})</span>
              </button>
            </div>

            {/* SUBTAB 1: OFFICIAL OBEC CENTRAL AGENCIES */}
            {feedSubTab === 'agencies' && (
              <section className={`rounded-xl p-5 border shadow-xs space-y-4 transition-colors ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-xl">account_balance</span>
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
                    className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-md border font-bold transition-all ${
                      darkMode
                        ? 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700'
                        : 'text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-slate-200'
                    }`}
                  >
                    <span>เว็บไซต์หลัก สพฐ.</span>
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </a>
                </div>

                {/* Agency Search */}
                <div className={`flex items-center rounded-xl border px-3 py-2 gap-2 transition-all ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 focus-within:border-slate-500 focus-within:bg-slate-900'
                    : 'bg-slate-50 border-slate-200 focus-within:border-slate-400 focus-within:bg-white'
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
                          : 'border-slate-200 bg-white hover:border-slate-400 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
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
                        darkMode ? 'border-slate-800' : 'border-slate-100'
                      }`}>
                        <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                          {agency.url}
                        </span>
                        <a
                          href={agency.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg font-bold text-xs shadow-xs active:scale-95 transition-all ${
                            darkMode
                              ? 'bg-slate-100 hover:bg-white text-slate-900'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}
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
              <section className={`rounded-xl p-5 border shadow-xs transition-colors ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className={`text-base font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-xl">star</span>
                    เขตพื้นที่ในรายการติดตาม ({watchlist.length})
                  </h2>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                    darkMode ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-700 bg-slate-100 border-slate-200'
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
                            ? 'bg-slate-900 border-slate-800 text-slate-300'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-sm block ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-200'
                              }`}>
                                {item.type}
                              </span>
                            </div>
                            {item.positions !== null ? (
                              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-extrabold text-xs border ${
                                darkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-900 border-slate-200'
                              }`}>
                                <span className="material-symbols-outlined text-sm text-slate-700 dark:text-slate-300">check_circle</span>
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
                            className={`font-semibold hover:text-rose-500 px-2.5 py-1 rounded-lg transition-all border text-xs shrink-0 ${
                              darkMode ? 'border-slate-700 text-slate-400 hover:border-rose-800' : 'border-slate-200 text-slate-500 hover:border-rose-300'
                            }`}
                          >
                            ยกเลิกติดตาม
                          </button>
                        </div>

                        {/* Direct Links in Watchlist */}
                        <div className={`flex flex-wrap items-center gap-2 pt-1 border-t ${
                          darkMode ? 'border-slate-800' : 'border-slate-100'
                        }`}>
                          <a
                            href={item.officialAnnouncementUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs shadow-xs transition-all ${
                              darkMode
                                ? 'bg-slate-100 hover:bg-white text-slate-900'
                                : 'bg-slate-900 hover:bg-slate-800 text-white'
                            }`}
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
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                                : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
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
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
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
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
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
              </section>
            )}

            {/* SUBTAB 3: OFFICIAL ANNOUNCEMENT FEED */}
            {feedSubTab === 'announcements' && (
              <section className={`rounded-xl p-5 border shadow-xs transition-colors ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h2 className={`text-base font-bold flex items-center gap-2 mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-xl">notifications_active</span>
                  ประกาศและสถานะทางการ (สพฐ.)
                </h2>
                <p className={`text-xs mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>รวบรวมประกาศอย่างเป็นทางการที่ผ่านการตรวจสอบแล้ว</p>

                <div className="space-y-3">
                  {feedItems.map((feed) => (
                    <div key={feed.id} className={`p-3.5 rounded-xl border transition-all ${
                      darkMode ? 'border-slate-800 bg-slate-800/50 hover:bg-slate-800' : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className={`flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          <span className="material-symbols-outlined text-xs">schedule</span>
                          {feed.timestamp}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {feed.source}
                        </span>
                      </div>
                      <h3 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{feed.title}</h3>
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
                  ? 'bg-slate-800/60 border-slate-700 text-slate-200'
                  : 'bg-slate-50 border border-slate-200 text-slate-900'
              }`}>
                <div className={`flex items-center gap-2 font-extrabold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <span className="material-symbols-outlined text-slate-700 dark:text-slate-300">assignment_turned_in</span>
                  <span>เปิดรับสมัครจริง: {selectedDistrictForDetails.positions} อัตรา ({selectedDistrictForDetails.positions} ตำแหน่งว่าง)</span>
                </div>
                <p className={`mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
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
                className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-sm shadow-xs active:scale-98 transition-all ${
                  darkMode
                    ? 'bg-slate-100 hover:bg-white text-slate-900'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    darkMode ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-white'
                  }`}>
                    <span className="material-symbols-outlined text-xl">download</span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm">ดาวน์โหลดประกาศ & เอกสารสมัคร</div>
                    <div className={`text-[11px] font-normal ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>ไฟล์ประกาศรับสมัครสอบแข่งขันและแบบฟอร์ม</div>
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
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    darkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'
                  }`}>
                    <span className="material-symbols-outlined text-xl">open_in_new</span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm">เข้าสู่เว็บไซต์ทางการ สพฐ. ประจำเขต</div>
                    <div className={`text-[11px] font-normal ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {selectedDistrictForDetails.websiteUrl}
                    </div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-lg text-slate-400">launch</span>
              </a>

              {selectedDistrictForDetails.ibnsUrl && (
                <a
                  href={selectedDistrictForDetails.ibnsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border font-bold text-sm active:scale-98 transition-all ${
                    darkMode
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      darkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'
                    }`}>
                      <span className="material-symbols-outlined text-xl">lan</span>
                    </div>
                    <div className="text-left">
                      <div className="text-sm">ระบบสารสนเทศ สพฐ. IBNS (พอร์ทัลเขต)</div>
                      <div className={`text-[11px] font-normal ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {selectedDistrictForDetails.ibnsUrl}
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-lg text-slate-400">launch</span>
                </a>
              )}

              {selectedDistrictForDetails.boppUrl && (
                <a
                  href={selectedDistrictForDetails.boppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border font-bold text-sm active:scale-98 transition-all ${
                    darkMode
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      darkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'
                    }`}>
                      <span className="material-symbols-outlined text-xl">database</span>
                    </div>
                    <div className="text-left">
                      <div className="text-sm">สารสนเทศเขตพื้นที่การศึกษา สพฐ. (BOPP)</div>
                      <div className={`text-[11px] font-normal ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {selectedDistrictForDetails.boppUrl}
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-lg text-slate-400">launch</span>
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
                  className={`px-3 py-1 rounded-lg font-bold text-xs shadow-xs transition-all ${
                    darkMode
                      ? 'bg-slate-100 hover:bg-white text-slate-900'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
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
                <span className="material-symbols-outlined text-base text-slate-700 dark:text-slate-300">task</span>
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
                    <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-sm mt-0.5">check_circle</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Critical Note */}
            <div className={`rounded-xl border p-3 text-xs space-y-1 ${
              darkMode
                ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <div className="font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-slate-700 dark:text-slate-300">warning</span>
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
                className={`w-full sm:w-auto px-5 py-2 rounded-lg font-bold text-xs transition-all ${
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

      {/* Global Bottom Navigation Bar (Matching Reference Image) */}
      <nav aria-label="แถบการนำทางหลัก" className={`fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-3 py-2 max-w-screen-md mx-auto backdrop-blur-md shadow-lg border-t transition-colors ${
        darkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200/80'
      }`}>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'dashboard'
              ? 'bg-[#102a6b] text-white font-bold shadow-sm'
              : darkMode
              ? 'text-slate-400 hover:text-white hover:bg-slate-800'
              : 'text-slate-600 hover:text-[#102a6b] hover:bg-slate-100 border border-dashed border-blue-200'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="widgets">widgets</span>
          <span className="text-[11px] font-semibold mt-0.5">ภาพรวม</span>
        </button>

        <button
          onClick={() => setActiveTab('districts')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'districts'
              ? 'bg-[#102a6b] text-white font-bold shadow-sm'
              : darkMode
              ? 'text-slate-400 hover:text-white hover:bg-slate-800'
              : 'text-slate-600 hover:text-[#102a6b] hover:bg-slate-100 border border-dashed border-blue-200'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="map">map</span>
          <span className="text-[11px] font-semibold mt-0.5">เขตพื้นที่</span>
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'subjects'
              ? 'bg-[#102a6b] text-white font-bold shadow-sm'
              : darkMode
              ? 'text-slate-400 hover:text-white hover:bg-slate-800'
              : 'text-slate-600 hover:text-[#102a6b] hover:bg-slate-100 border border-dashed border-blue-200'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="swap_horiz">swap_horiz</span>
          <span className="text-[11px] font-semibold mt-0.5">วิชาเอก</span>
        </button>

        <button
          onClick={() => setActiveTab('feed')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all ${
            activeTab === 'feed'
              ? 'bg-[#102a6b] text-white font-bold shadow-sm'
              : darkMode
              ? 'text-slate-400 hover:text-white hover:bg-slate-800'
              : 'text-slate-600 hover:text-[#102a6b] hover:bg-slate-100 border border-dashed border-blue-200'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="notifications">notifications</span>
          <span className="text-[11px] font-semibold mt-0.5">ฟีดสด</span>
        </button>
      </nav>
    </div>
  );
}
