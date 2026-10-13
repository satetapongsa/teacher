import { useState, useEffect, useMemo } from 'react';
import {
  fetchObecStatisticsAPI,
  type DistrictData,
  type MajorSubjectData,
  type LiveFeedItem,
  INITIAL_FEED,
} from './services/obecApi';

// Official OBEC 2569 Schedule
const REGISTRATION_START_STR = '19 ต.ค. 2569';
const REGISTRATION_END_STR = '25 ต.ค. 2569';
const REGISTRATION_HOURS_STR = 'ระบบเปิด 08:30 - 16:30 น.';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'districts' | 'subjects' | 'feed'>('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('14:45 น.');

  // Data states from OBEC API
  const [districts, setDistricts] = useState<DistrictData[]>([]);
  const [majors, setMajors] = useState<MajorSubjectData[]>([]);
  const [summary, setSummary] = useState({
    totalApplicants: 148920,
    totalPositions: 4850,
    averageRatio: 31,
    peakDistrict: 'สพม.กรุงเทพฯ เขต 1',
    peakRatio: 89,
    updatedAt: '14:45 น.',
  });

  // Filters & State
  const [searchDistrict, setSearchDistrict] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [feedItems] = useState<LiveFeedItem[]>(INITIAL_FEED);
  const [watchlist, setWatchlist] = useState<string[]>(['spm-bkk-1', 'spp-chiangmai-1']);
  
  // Real countdown timer based on actual system time
  const [nowTime, setNowTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Targets based on real schedule: 19 - 25 ต.ค. 2569
  // Year: 2026, Month: 9 (October is 0-indexed: 0=Jan..9=Oct)
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
        badge: 'ยังไม่เปิดรับสมัคร',
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

  const loadObecData = async () => {
    try {
      const res = await fetchObecStatisticsAPI();
      setDistricts(res.districts);
      setMajors(res.majors);
      setSummary(res.summary);
      setLastSyncTime(res.summary.updatedAt);
    } catch (e) {
      console.error('Failed to load OBEC data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadObecData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadObecData();
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
        d.province.toLowerCase().includes(searchDistrict.toLowerCase()) ||
        d.topMajors.some((m) => m.toLowerCase().includes(searchDistrict.toLowerCase()));
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
            <h1 className="text-headline-sm font-headline-sm font-bold text-primary tracking-tight">สถิติครูผู้ช่วย 2569</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Live Sync Pill */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-container/30 border border-secondary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
              </span>
              <span className="text-label-sm font-label-sm text-secondary font-semibold">{lastSyncTime}</span>
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
                <span className="text-label-sm font-label-sm text-primary-fixed-dim">{REGISTRATION_HOURS_STR}</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-blue-100 mb-2">
                <span className="material-symbols-outlined text-sm">event</span>
                <span>กำหนดการรับสมัครออนไลน์: {REGISTRATION_START_STR} – {REGISTRATION_END_STR}</span>
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

            {/* Quick Analytic Chips / Shortcuts */}
            <section aria-label="ทางลัดสถิติ" className="no-scrollbar flex items-center gap-2 overflow-x-auto py-1">
              <button
                onClick={() => { setSelectedRegion('all'); setActiveTab('dashboard'); }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-container text-on-primary text-label-md font-label-md shadow-sm active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-base" data-icon="explore">explore</span>
                <span>ภาพรวมทั้งประเทศ</span>
              </button>
              <button
                onClick={() => { setSelectedRegion('central'); setActiveTab('districts'); }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest text-on-surface border border-outline-variant/60 text-label-md font-label-md hover:bg-surface-container active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-base text-primary" data-icon="location_city">location_city</span>
                <span>กรุงเทพฯ-ปริมณฑล</span>
              </button>
              <button
                onClick={() => setActiveTab('subjects')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest text-on-surface border border-outline-variant/60 text-label-md font-label-md hover:bg-surface-container active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-base text-tertiary-container" data-icon="local_fire_department">local_fire_department</span>
                <span>วิชาเอกยอดฮิต</span>
              </button>
              <button
                onClick={() => { setSelectedRegion('south'); setActiveTab('districts'); }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest text-on-surface border border-outline-variant/60 text-label-md font-label-md hover:bg-surface-container active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-base text-secondary" data-icon="trending_down">trending_down</span>
                <span>เขตการแข่งขันต่ำ</span>
              </button>
            </section>

            {/* Key Metric KPI Bento Grid */}
            <section aria-label="ตัวชี้วัดสำคัญระดับประเทศ" className="grid grid-cols-2 gap-space-sm sm:gap-space-md">
              {/* Metric 1 */}
              <article className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="text-label-md font-label-md">ผู้สมัครรวมทั่วประเทศ</span>
                    <span className="material-symbols-outlined text-primary text-lg" data-icon="group">group</span>
                  </div>
                  <div className="text-stat-display font-stat-display text-primary tracking-tight">
                    {summary.totalApplicants.toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-label-sm font-label-sm text-secondary font-medium">
                  <span className="material-symbols-outlined text-sm" data-icon="arrow_upward">arrow_upward</span>
                  <span>+3,420 วันนี้</span>
                  <span className="text-on-surface-variant font-normal text-[10px] ml-0.5">(+2.3%)</span>
                </div>
              </article>

              {/* Metric 2 */}
              <article className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="text-label-md font-label-md">ตำแหน่งเปิดรับทั้งหมด</span>
                    <span className="material-symbols-outlined text-primary text-lg" data-icon="badge">badge</span>
                  </div>
                  <div className="text-stat-display font-stat-display text-on-surface tracking-tight">
                    {summary.totalPositions.toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-label-sm font-label-sm text-on-surface-variant">
                  <span>204 เขตพื้นที่</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface text-[10px] font-semibold">รอบทั่วไป</span>
                </div>
              </article>

              {/* Metric 3 */}
              <article className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 border-l-4 border-l-tertiary-container shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="text-label-md font-label-md">อัตราแข่งขันเฉลี่ย</span>
                    <span className="material-symbols-outlined text-tertiary-container text-lg" data-icon="balance">balance</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-stat-display font-stat-display text-primary tracking-tight">1 : {summary.averageRatio}</span>
                    <span className="text-label-sm font-label-sm text-on-surface-variant">อัตรา</span>
                  </div>
                </div>
                <div className="mt-2 text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-tertiary-container"></span>
                  <span>ระดับแข่งขันปานกลาง-สูง</span>
                </div>
              </article>

              {/* Metric 4 */}
              <article className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 border-l-4 border-l-error shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="text-label-md font-label-md">แข่งขันสูงสุด</span>
                    <span className="material-symbols-outlined text-error text-lg" data-icon="local_fire_department">local_fire_department</span>
                  </div>
                  <div className="text-headline-md font-headline-md text-error tracking-tight font-bold">1 : {summary.peakRatio}</div>
                </div>
                <div className="mt-2 text-label-sm font-label-sm text-on-surface font-medium truncate" title={summary.peakDistrict}>
                  {summary.peakDistrict}
                </div>
              </article>
            </section>

            {/* 5-Day Trend Curve Section */}
            <section className="bg-surface-container-lowest rounded-xl p-space-lg border border-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between mb-space-md">
                <div>
                  <h2 className="text-headline-sm font-headline-sm text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-xl" data-icon="trending_up">trending_up</span>
                    แนวโน้มการสมัคร 5 วันย้อนหลัง
                  </h2>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">ยอดสะสมรายวันเร่งตัวต่อเนื่องช่วงโค้งสุดท้าย</p>
                </div>
                <span className="text-label-sm font-label-sm bg-surface-container px-2 py-1 rounded text-on-surface font-medium">หน่วย: คน</span>
              </div>

              <div className="pt-2 pb-1 space-y-3">
                {[
                  { date: '24 พ.ค. (วันแรก)', count: '18,400', delta: '+18.4k', pct: '28%', active: false },
                  { date: '25 พ.ค.', count: '43,150', delta: '+24.7k', pct: '46%', active: false },
                  { date: '26 พ.ค.', count: '76,800', delta: '+33.6k', pct: '64%', active: false },
                  { date: '27 พ.ค.', count: '115,500', delta: '+38.7k', pct: '82%', active: false },
                  { date: '28 พ.ค. (วันนี้)', count: '148,920', delta: '+33.4k ล่าสุด', pct: '100%', active: true },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-label-sm font-label-sm">
                      <span className={item.active ? 'font-semibold text-primary flex items-center gap-1' : 'text-on-surface-variant'}>
                        {item.date}
                        {item.active && <span className="h-1.5 w-1.5 rounded-full bg-secondary inline-block"></span>}
                      </span>
                      <span className={item.active ? 'font-bold text-primary' : 'font-semibold text-on-surface'}>
                        {item.count} <span className="text-secondary font-normal text-[11px]">{item.delta}</span>
                      </span>
                    </div>
                    <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: item.pct }}></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-space-md pt-space-sm border-t border-outline-variant/30 flex items-center justify-between text-label-sm font-label-sm text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-secondary" data-icon="info">info</span>
                  คาดการณ์วันสุดท้ายทะลุ 180,000 คน จากสถิติฐานข้อมูลกลาง สพฐ.
                </span>
              </div>
            </section>

            {/* 3 อันดับวิชาเอกยอดนิยม */}
            <section className="bg-surface-container-lowest rounded-xl p-space-lg border border-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between mb-space-md">
                <div>
                  <h2 className="text-headline-sm font-headline-sm text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-tertiary-container text-xl" data-icon="leaderboard">leaderboard</span>
                    3 อันดับวิชาเอกยอดนิยม
                  </h2>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">สาขาที่มีจำนวนผู้สมัครสะสมสูงสุดทั่วประเทศ</p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-label-sm font-label-sm font-semibold">สถิติรวม</span>
              </div>

              <div className="space-y-space-md">
                {majors.slice(0, 3).map((major, idx) => (
                  <div key={major.id} className="p-space-sm rounded-lg border border-outline-variant/30 bg-surface/50">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full bg-primary text-on-primary text-label-sm font-label-sm font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <h3 className="text-headline-sm font-headline-sm text-on-surface text-base">{major.name}</h3>
                          <p className="text-label-sm font-label-sm text-on-surface-variant">
                            รับ {major.positions} อัตรา • สมัคร {major.applicants.toLocaleString()} คน
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-2 py-0.5 rounded bg-error-container text-error text-label-sm font-label-sm font-bold">
                          1 : {major.ratio}
                        </span>
                        <p className="text-[10px] text-on-surface-variant mt-0.5">
                          {major.ratio > 50 ? 'แข่งขันสูงมาก' : major.ratio > 40 ? 'แข่งขันสูง' : 'แข่งขันปานกลาง'}
                        </p>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${major.percentile}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-space-md">
                <button
                  onClick={() => setActiveTab('subjects')}
                  className="w-full py-2.5 px-4 rounded-lg bg-surface-container text-primary font-semibold text-label-lg font-label-lg hover:bg-surface-container-high active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-lg" data-icon="compare_arrows">compare_arrows</span>
                  <span>เปรียบเทียบทุกสาขาวิชาเอก (62 สาขา)</span>
                </button>
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
                placeholder="ค้นหาเขตพื้นที่ เช่น สพม.กรุงเทพฯ, สพป.เชียงใหม่ หรือวิชาเอก..."
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
                    สถิติเจาะลึกรายเขตพื้นที่ (สพฐ.)
                  </h2>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">
                    พบทั้งหมด {filteredDistricts.length} เขตพื้นที่การศึกษา
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
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              d.competitionLevel === 'high'
                                ? 'bg-error-container text-error'
                                : d.competitionLevel === 'medium'
                                ? 'bg-tertiary-fixed text-tertiary'
                                : 'bg-secondary-container/40 text-secondary'
                            }`}
                          >
                            1 : {d.ratio}
                          </span>
                          <button
                            onClick={() => toggleWatchlist(d.id)}
                            className="p-1 hover:bg-surface-container rounded text-outline hover:text-amber-500"
                          >
                            <span className={`material-symbols-outlined text-lg ${isSaved ? 'text-amber-500 font-variation-settings-[FILL_1]' : ''}`}>
                              {isSaved ? 'star' : 'star'}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-surface-container-low rounded-lg p-2.5 mt-2 text-xs">
                        <div>
                          <span className="text-on-surface-variant block text-[11px]">ตำแหน่งว่าง</span>
                          <span className="font-semibold text-on-surface">{d.positions} อัตรา</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block text-[11px]">ผู้สมัครสะสม</span>
                          <span className="font-semibold text-on-surface">{d.applicants.toLocaleString()} คน</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant block text-[11px]">ระดับการแข่งขัน</span>
                          <span className={`font-semibold ${
                            d.competitionLevel === 'high' ? 'text-error' : d.competitionLevel === 'medium' ? 'text-tertiary' : 'text-secondary'
                          }`}>
                            {d.competitionLevel === 'high' ? 'สูงมาก' : d.competitionLevel === 'medium' ? 'ปานกลาง' : 'แข่งขันต่ำ'}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-primary mt-1.5">
                        <span className="text-on-surface-variant">วิชาเอกยอดนิยม:</span> {d.topMajors.join(', ')}
                      </p>
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
                    สถิติเปรียบเทียบสาขาวิชาเอก
                  </h2>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">ข้อมูลรวมทั้ง 62 สาขาวิชาเอกทั่วประเทศ (รอบทั่วไป)</p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-xs font-semibold">รอบทั่วไป</span>
              </div>

              <div className="divide-y divide-outline-variant/20">
                {majors.map((m, idx) => (
                  <div key={m.id} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-outline w-6">#{idx + 1}</span>
                        <div>
                          <h3 className="font-semibold text-sm text-on-surface">{m.name}</h3>
                          <p className="text-xs text-on-surface-variant">
                            กลุ่ม {m.category} • รับ {m.positions} อัตรา • สมัคร {m.applicants.toLocaleString()} คน
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                          m.competitionLevel === 'high'
                            ? 'bg-error-container text-error'
                            : m.competitionLevel === 'medium'
                            ? 'bg-tertiary-fixed text-tertiary'
                            : 'bg-secondary-container/40 text-secondary'
                        }`}
                      >
                        1 : {m.ratio}
                      </span>
                    </div>

                    <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${m.percentile}%` }}></div>
                    </div>
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
              <p className="text-body-sm font-body-sm text-on-surface-variant mb-3">แจ้งเตือนความหนาแน่นและยอดสมัครรายชั่วโมง</p>

              <div className="space-y-2">
                {watchlist.map((wid) => {
                  const item = districts.find((d) => d.id === wid);
                  if (!item) return null;
                  return (
                    <div key={wid} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs">
                      <div>
                        <span className="font-semibold text-on-surface text-sm block">{item.name}</span>
                        <span className="text-on-surface-variant">
                          รับ {item.positions} อัตรา • สมัคร {item.applicants.toLocaleString()} คน • อัตราแข่งขัน 1:{item.ratio}
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

            {/* Real-time Event Feed */}
            <section className="bg-surface-container-lowest rounded-xl p-space-lg border border-outline-variant/40 shadow-sm">
              <h2 className="text-headline-sm font-headline-sm text-primary flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-primary text-xl">notifications_active</span>
                ฟีดแจ้งเตือนการสมัครสด
              </h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant mb-3">ระบบเชื่อมต่อฐานข้อมูลกลาง สพฐ. อัปเดตทุก 15 นาที</p>

              <div className="space-y-3">
                {feedItems.map((feed) => (
                  <div key={feed.id} className="p-3 rounded-lg border border-outline-variant/30 bg-surface/50">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        {feed.timestamp}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-secondary-container/40 text-secondary font-bold text-[10px]">
                        +{feed.delta}
                      </span>
                    </div>
                    <h3 className="font-bold text-primary text-sm">{feed.district}</h3>
                    <p className="text-xs text-on-surface mt-0.5">{feed.message}</p>
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
          <span className="text-label-sm font-label-sm mt-0.5">ฟีดสด</span>
        </button>
      </nav>
    </div>
  );
}
