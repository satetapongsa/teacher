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
const REGISTRATION_PERIOD_STR = '19 – 25 ตุลาคม 2569';

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
    statusText: 'รอเปิดระบบรับสมัครอย่างเป็นทางการ (19 ต.ค. 2569)',
    updatedAt: '02:30 น.',
  });

  // Filters & State
  const [searchDistrict, setSearchDistrict] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [feedItems] = useState<LiveFeedItem[]>(OFFICIAL_FEED);
  const [watchlist, setWatchlist] = useState<string[]>(['spm-bkk-1', 'spm-chiangmai']);
  
  // Real countdown timer based on actual system time
  const [nowTime, setNowTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // กำหนดการจริง: 19 ต.ค. 2569 08:30 น. - 25 ต.ค. 2569 16:30 น.
  // Month: 9 (ตุลาคม: 0=Jan..9=Oct)
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
        title: 'นับถอยหลังเปิดรับสมัครออนไลน์ (19 ต.ค. 69 เวลา 08:30 น.)',
        badge: 'รอเปิดรับสมัคร',
        display: `อีก ${days} วัน ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
      };
    } else if (currentMs <= closeMs) {
      // กำลังเปิดรับสมัคร
      const diffSec = Math.max(0, Math.floor((closeMs - currentMs) / 1000));
      const days = Math.floor(diffSec / 86400);
      const hours = Math.floor((diffSec % 86400) / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');

      return {
        status: 'open',
        title: 'นับถอยหลังปิดรับสมัครออนไลน์ (25 ต.ค. 69 เวลา 16:30 น.)',
        badge: 'ระบบกำลังเปิดรับสมัคร',
        display: `อีก ${days} วัน ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
      };
    } else {
      return {
        status: 'closed',
        title: 'ระบบปิดรับสมัครออนไลน์แล้ว',
        badge: 'ปิดรับสมัครเรียบร้อย',
        display: 'สิ้นสุดการรับสมัครรอบทั่วไป 2569',
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
    <div className="bg-surface text-on-surface min-h-screen pb-24 antialiased selection:bg-primary-container selection:text-on-primary">
      {/* TopAppBar Component */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md shadow-sm border-b border-outline-variant/30">
        <div className="flex justify-between items-center w-full px-space-lg py-space-sm max-w-screen-md mx-auto">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl" data-icon="analytics">analytics</span>
            <div>
              <h1 className="text-headline-sm font-headline-sm font-bold text-primary tracking-tight leading-tight">
                สถิติครูผู้ช่วย 2569
              </h1>
              <span className="text-[11px] text-on-surface-variant block">สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Live Sync Pill */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-container/30 border border-secondary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
              </span>
              <span className="text-label-sm font-label-sm text-secondary font-semibold" title={`ตรวจสอบข้อมูล สพฐ. ประจำวัน: ${lastSyncDate}`}>
                {lastSyncTime} (อัปเดตวันนี้)
              </span>
            </div>
            {/* Trailing Refresh button */}
            <button
              onClick={handleRefresh}
              aria-label="รีเฟรชข้อมูล"
              className="p-1.5 rounded-lg text-primary hover:bg-surface-container active:scale-95 transition-all duration-150"
            >
              <span className={`material-symbols-outlined text-xl ${isRefreshing ? 'animate-spin' : ''}`} data-icon="sync">sync</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Analytical Canvas */}
      <main className="max-w-screen-md mx-auto px-space-lg pt-space-md space-y-space-md">
        {/* ================= VIEW 1: DASHBOARD ================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-space-md">
            {/* Hero Countdown & Official Notice Banner */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary text-on-primary p-space-lg shadow-sm border border-outline-variant/30">
              <div className="absolute -right-6 -bottom-8 opacity-10 pointer-events-none">
                <span className="material-symbols-outlined text-9xl">school</span>
              </div>
              <div className="flex items-center justify-between gap-2 mb-space-sm">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/15 text-white backdrop-blur-sm">
                  <span className="material-symbols-outlined text-sm" data-icon="campaign">campaign</span>
                  <span className="text-label-sm font-label-sm">สพฐ. รอบทั่วไป 2569</span>
                </div>
                <span className="text-label-sm font-label-sm text-primary-fixed-dim">ระบบออนไลน์ 08:30 – 16:30 น.</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-blue-100 mb-2">
                <span className="material-symbols-outlined text-sm">event</span>
                <span>กำหนดการรับสมัครอย่างเป็นทางการ: {REGISTRATION_PERIOD_STR}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <p className="text-label-md font-label-md text-primary-fixed-dim">
                    {countdownInfo.title}
                  </p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-headline-xl-mobile sm:text-headline-xl font-headline-xl text-white tracking-tight">
                      {countdownInfo.display}
                    </span>
                    <span className="text-label-md font-label-md text-primary-fixed-dim">
                      {countdownInfo.status !== 'closed' ? 'ชม.' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-label-sm font-label-sm bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
                  <span className="material-symbols-outlined text-base text-secondary-container" data-icon="verified_user">verified_user</span>
                  <span>{countdownInfo.badge}</span>
                </div>
              </div>
            </div>

            {/* Status Advisory Card: แจ้งผู้สมัครตามจริง */}
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-md flex gap-3 items-start shadow-xs">
              <span className="material-symbols-outlined text-primary text-2xl shrink-0 mt-0.5">info</span>
              <div className="text-body-sm font-body-sm space-y-1">
                <p className="font-semibold text-on-surface">ประกาศสถานะฐานข้อมูล สพฐ. (ข้อมูลทางการ):</p>
                <p className="text-on-surface-variant leading-relaxed">
                  ขณะนี้อยู่ในช่วงเตรียมการเปิดรับสมัครสอบแข่งขันรอบทั่วไป ปี 2569 (เปิดรับสมัครจริง 19 – 25 ตุลาคม 2569) 
                  สถิติตัวเลขผู้สมัครและอัตราการแข่งขันจะเริ่มอัปเดตเข้าระบบฐานข้อมูลกลางทันทีหลังจากระบบรับสมัครเปิดทำการ
                </p>
              </div>
            </div>

            {/* Key Metric KPI Bento Grid (Real State: ยังไม่มีข้อมูลระหว่างรอเปิดระบบ) */}
            <section aria-label="ตัวชี้วัดสำคัญระดับประเทศ" className="grid grid-cols-2 gap-space-sm sm:gap-space-md">
              {/* Metric 1: Total Applicants */}
              <article className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="text-label-md font-label-md">ผู้สมัครรวมทั่วประเทศ</span>
                    <span className="material-symbols-outlined text-primary text-lg" data-icon="group">group</span>
                  </div>
                  <div className="text-headline-md font-headline-md text-on-surface-variant tracking-tight font-semibold mt-1">
                    {summary.totalApplicants !== null ? summary.totalApplicants.toLocaleString() : 'รอเปิดรับสมัคร'}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-label-sm font-label-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm text-outline">schedule</span>
                  <span>เปิดระบบ 19 ต.ค. 69</span>
                </div>
              </article>

              {/* Metric 2: Total Positions */}
              <article className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="text-label-md font-label-md">ตำแหน่งเปิดรับทั้งหมด</span>
                    <span className="material-symbols-outlined text-primary text-lg" data-icon="badge">badge</span>
                  </div>
                  <div className="text-headline-md font-headline-md text-on-surface-variant tracking-tight font-semibold mt-1">
                    {summary.totalPositions !== null ? summary.totalPositions.toLocaleString() : 'รอประกาศทางการ'}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-label-sm font-label-sm text-on-surface-variant">
                  <span>204 เขตพื้นที่</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface text-[10px] font-semibold">รอบทั่วไป</span>
                </div>
              </article>

              {/* Metric 3: Average Competition Ratio */}
              <article className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 border-l-4 border-l-outline shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="text-label-md font-label-md">อัตราแข่งขันเฉลี่ย</span>
                    <span className="material-symbols-outlined text-outline text-lg" data-icon="balance">balance</span>
                  </div>
                  <div className="text-headline-md font-headline-md text-on-surface-variant tracking-tight font-semibold mt-1">
                    {summary.averageRatio !== null ? `1 : ${summary.averageRatio}` : 'ยังไม่มีข้อมูล'}
                  </div>
                </div>
                <div className="mt-2 text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-outline"></span>
                  <span>คำนวณเมื่อเปิดรับสมัคร</span>
                </div>
              </article>

              {/* Metric 4: Peak Competition District */}
              <article className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 border-l-4 border-l-outline shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="text-label-md font-label-md">แข่งขันสูงสุด</span>
                    <span className="material-symbols-outlined text-outline text-lg" data-icon="local_fire_department">local_fire_department</span>
                  </div>
                  <div className="text-headline-md font-headline-md text-on-surface-variant tracking-tight font-semibold mt-1">
                    {summary.peakRatio !== null ? `1 : ${summary.peakRatio}` : 'ยังไม่มีข้อมูล'}
                  </div>
                </div>
                <div className="mt-2 text-label-sm font-label-sm text-on-surface-variant truncate">
                  คำนวณตามยอดรายวัน
                </div>
              </article>
            </section>

            {/* Official Schedule Timeline Section (ข้อมูลจริงที่ตรวจสอบได้) */}
            <section className="bg-surface-container-lowest rounded-xl p-space-lg border border-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between mb-space-md">
                <div>
                  <h2 className="text-headline-sm font-headline-sm text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-xl" data-icon="event">event</span>
                    ปฏิทินการสอบแข่งขันครูผู้ช่วย 2569 (สพฐ. รอบทั่วไป)
                  </h2>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">กำหนดการอย่างเป็นทางการสำหรับผู้สมัครทั่วประเทศ</p>
                </div>
                <span className="text-label-sm font-label-sm bg-primary-fixed text-on-primary-fixed px-2 py-1 rounded font-semibold">
                  กำหนดการจริง
                </span>
              </div>

              <div className="space-y-3 pt-1">
                {[
                  { date: 'ภายใน 12 ต.ค. 2569', title: 'ประกาศรับสมัครสอบแข่งขัน', desc: 'แต่ละ อ.ก.ค.ศ. เขตพื้นที่การศึกษาประกาศรายละเอียดตำแหน่งว่างและวิชาเอก', done: true },
                  { date: '19 – 25 ต.ค. 2569', title: 'รับสมัครสอบแข่งขันผ่านระบบออนไลน์', desc: 'เปิดระบบ 19 ต.ค. เวลา 08:30 น. ถึง 25 ต.ค. เวลา 16:30 น. (ไม่เว้นวันหยุดราชการ)', active: true },
                  { date: 'ภายใน 28 ต.ค. 2569', title: 'ประกาศรายชื่อผู้มีสิทธิ์สอบ ภาค ก และ ภาค ข', desc: 'ตรวจสอบรายชื่อและสถานที่สอบตามเขตพื้นที่ที่สมัคร', done: false },
                  { date: '14 พ.ย. 2569', title: 'สอบข้อเขียน ภาค ก (ความรู้ความสามารถทั่วไป)', desc: 'การสอบข้อเขียนภาคความรู้ความสามารถทั่วไปและกฎหมายการศึกษา', done: false },
                  { date: '15 พ.ย. 2569', title: 'สอบข้อเขียน ภาค ข (มาตรฐานวิชาชีพครู)', desc: 'การสอบข้อเขียนความรู้ความสามารถเกี่ยวกับวิชาชีพและวิชาเอก', done: false },
                  { date: 'ภายใน 18 พ.ย. 2569', title: 'ประกาศผลผู้สอบผ่าน ภาค ก และ ภาค ข', desc: 'ผู้ผ่านเกณฑ์มีสิทธิเข้ารับการประเมิน ภาค ค ต่อไป', done: false },
                ].map((step, idx) => (
                  <div key={idx} className={`p-3 rounded-lg border transition-all ${
                    step.active 
                      ? 'border-primary bg-primary-fixed/20' 
                      : step.done 
                      ? 'border-outline-variant/30 bg-surface/40' 
                      : 'border-outline-variant/20 bg-surface/20 opacity-80'
                  }`}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className={`font-semibold flex items-center gap-1 ${step.active ? 'text-primary' : 'text-on-surface-variant'}`}>
                        <span className="material-symbols-outlined text-sm">
                          {step.done ? 'check_circle' : step.active ? 'pending' : 'schedule'}
                        </span>
                        {step.date}
                      </span>
                      {step.active && (
                        <span className="px-2 py-0.5 rounded-full bg-secondary-container/50 text-secondary font-bold text-[10px]">
                          ขั้นตอนถัดไป
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm text-on-surface">{step.title}</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ================= VIEW 2: DISTRICTS ================= */}
        {activeTab === 'districts' && (
          <div className="space-y-space-md">
            {/* Search Box */}
            <div className="flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/60 px-3 py-2 gap-2 shadow-xs">
              <span className="material-symbols-outlined text-outline">search</span>
              <input
                type="text"
                className="w-full bg-transparent outline-none text-sm text-on-surface placeholder:text-outline"
                placeholder="ค้นหาเขตพื้นที่ เช่น สพม.กรุงเทพฯ, สพป.เชียงใหม่..."
                value={searchDistrict}
                onChange={(e) => setSearchDistrict(e.target.value)}
              />
              {searchDistrict && (
                <button onClick={() => setSearchDistrict('')} className="text-outline hover:text-on-surface">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            {/* Region Filter Chips */}
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto py-1">
              {[
                { id: 'all', label: 'ทุกภูมิภาค' },
                { id: 'central', label: 'ภาคกลาง/กทม.' },
                { id: 'north', label: 'ภาคเหนือ' },
                { id: 'northeast', label: 'ภาคอีสาน' },
                { id: 'south', label: 'ภาคใต้' },
                { id: 'east', label: 'ภาคตะวันออก' },
                { id: 'west', label: 'ภาคตะวันตก' },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRegion(r.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    selectedRegion === r.id
                      ? 'bg-primary-container text-white shadow-xs'
                      : 'bg-surface-container-lowest text-on-surface border border-outline-variant/60 hover:bg-surface-container'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* District List Card */}
            <section className="bg-surface-container-lowest rounded-xl p-space-lg border border-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-headline-sm font-headline-sm text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-xl">map</span>
                    รายชื่อเขตพื้นที่การศึกษา สพฐ. ({filteredDistricts.length} เขต)
                  </h2>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">
                    สถานะปัจจุบัน: รอเปิดระบบรับสมัครออนไลน์พร้อมกันทั่วประเทศ (19 ต.ค. 69)
                  </p>
                </div>
              </div>

              <div className="divide-y divide-outline-variant/20">
                {filteredDistricts.map((d) => {
                  const isSaved = watchlist.includes(d.id);
                  return (
                    <div key={d.id} className="py-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-on-surface text-sm sm:text-base">{d.name}</h3>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-container font-semibold text-on-surface-variant">
                              {d.type}
                            </span>
                          </div>
                          <p className="text-xs text-on-surface-variant mt-0.5">จังหวัด {d.province}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-surface-container text-on-surface-variant">
                            รอเปิดรับสมัคร
                          </span>
                          <button
                            onClick={() => toggleWatchlist(d.id)}
                            className="p-1 hover:bg-surface-container rounded text-outline hover:text-amber-500"
                            title={isSaved ? 'อยู่ในรายการติดตาม' : 'บันทึกเขตนี้'}
                          >
                            <span className="material-symbols-outlined text-lg">
                              {isSaved ? 'star' : 'star_outline'}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 mt-2 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-outline">schedule</span>
                          เปิดรับสมัคร: 19 ต.ค. 2569 เวลา 08:30 น.
                        </span>
                        <span className="text-[11px] text-primary">สถิติผู้สมัคร: รอเปิดระบบ</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ================= VIEW 3: SUBJECTS ================= */}
        {activeTab === 'subjects' && (
          <div className="space-y-space-md">
            <section className="bg-surface-container-lowest rounded-xl p-space-lg border border-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-headline-sm font-headline-sm text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-xl">compare_arrows</span>
                    กลุ่มสาขาวิชาเอกหลักในการสอบครูผู้ช่วย สพฐ.
                  </h2>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">
                    รายชื่อวิชาเอกตามโครงสร้างหลักสูตรการสอบแข่งขันรอบทั่วไป
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-xs font-semibold">รอบทั่วไป 2569</span>
              </div>

              <div className="divide-y divide-outline-variant/20">
                {majors.map((m, idx) => (
                  <div key={m.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-outline w-6">#{idx + 1}</span>
                      <div>
                        <h3 className="font-semibold text-sm text-on-surface">{m.name}</h3>
                        <p className="text-xs text-on-surface-variant">กลุ่มสาระการเรียนรู้: {m.category}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs bg-surface-container text-on-surface-variant">
                      รอเปิดระบบรับสมัคร
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ================= VIEW 4: LIVE FEED & WATCHLIST ================= */}
        {activeTab === 'feed' && (
          <div className="space-y-space-md">
            {/* Watchlist Section */}
            <section className="bg-surface-container-lowest rounded-xl p-space-lg border border-outline-variant/40 shadow-sm">
              <h2 className="text-headline-sm font-headline-sm text-primary flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-primary text-xl">bookmarks</span>
                เขตพื้นที่ในรายการติดตาม ({watchlist.length})
              </h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant mb-3">บันทึกเขตพื้นที่เพื่อรอการแจ้งเตือนสถิติในวันเปิดรับสมัคร</p>

              <div className="space-y-2">
                {watchlist.map((wid) => {
                  const item = districts.find((d) => d.id === wid);
                  if (!item) return null;
                  return (
                    <div key={wid} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs">
                      <div>
                        <span className="font-semibold text-on-surface text-sm block">{item.name}</span>
                        <span className="text-on-surface-variant">
                          จังหวัด {item.province} • รอเปิดรับสมัคร 19 ต.ค. 69
                        </span>
                      </div>
                      <button
                        onClick={() => toggleWatchlist(wid)}
                        className="text-error font-semibold hover:underline px-2 py-1"
                      >
                        ลบ
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Official Announcement Feed */}
            <section className="bg-surface-container-lowest rounded-xl p-space-lg border border-outline-variant/40 shadow-sm">
              <h2 className="text-headline-sm font-headline-sm text-primary flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-primary text-xl">notifications_active</span>
                ประกาศและสถานะทางการ (สพฐ.)
              </h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant mb-3">รวบรวมประกาศอย่างเป็นทางการที่ผ่านการตรวจสอบแล้ว</p>

              <div className="space-y-3">
                {feedItems.map((feed) => (
                  <div key={feed.id} className="p-3 rounded-lg border border-outline-variant/30 bg-surface/50">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        {feed.timestamp}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-semibold text-[10px]">
                        {feed.source}
                      </span>
                    </div>
                    <h3 className="font-bold text-primary text-sm">{feed.title}</h3>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{feed.message}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Global Bottom Navigation Bar */}
      <nav aria-label="แถบการนำทางหลัก" className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-space-sm py-space-xs max-w-screen-md mx-auto bg-surface/95 backdrop-blur-md shadow-md border-t border-outline-variant/30">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center rounded-lg px-space-md py-space-xs transition-all ${
            activeTab === 'dashboard'
              ? 'bg-primary-container text-white font-semibold shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="dashboard">dashboard</span>
          <span className="text-label-sm font-label-sm mt-0.5">ภาพรวม</span>
        </button>

        <button
          onClick={() => setActiveTab('districts')}
          className={`flex flex-col items-center justify-center rounded-lg px-space-md py-space-xs transition-all ${
            activeTab === 'districts'
              ? 'bg-primary-container text-white font-semibold shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="map">map</span>
          <span className="text-label-sm font-label-sm mt-0.5">เขตพื้นที่</span>
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          className={`flex flex-col items-center justify-center rounded-lg px-space-md py-space-xs transition-all ${
            activeTab === 'subjects'
              ? 'bg-primary-container text-white font-semibold shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="compare_arrows">compare_arrows</span>
          <span className="text-label-sm font-label-sm mt-0.5">วิชาเอก</span>
        </button>

        <button
          onClick={() => setActiveTab('feed')}
          className={`flex flex-col items-center justify-center rounded-lg px-space-md py-space-xs transition-all ${
            activeTab === 'feed'
              ? 'bg-primary-container text-white font-semibold shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-xl" data-icon="notifications_active">notifications_active</span>
          <span className="text-label-sm font-label-sm mt-0.5">ประกาศ สพฐ.</span>
        </button>
      </nav>
    </div>
  );
}
