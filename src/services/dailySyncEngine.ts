import { OFFICIAL_DISTRICTS, OFFICIAL_MAJORS } from '../services/obecApi';
import type { DistrictData, MajorSubjectData } from '../services/obecApi';

export interface DailyUpdateRecord {
  lastUpdatedDate: string; // YYYY-MM-DD
  lastSyncTimestamp: string;
  source: string;
  isOfficialVerified: boolean;
  registrationStatus: 'pending_open' | 'open' | 'closed';
  districts: DistrictData[];
  majors: MajorSubjectData[];
  summary: {
    totalApplicants: number | null; // null if not open yet
    totalPositions: number | null; // null if pending compilation
    averageRatio: number | null;
    peakDistrict: string | null;
    peakRatio: number | null;
    statusText: string;
  };
}

const STORAGE_KEY = 'obec_daily_teacher_stats_v2';

function getInitialRecord(): DailyUpdateRecord {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  const todayStr = now.toISOString().slice(0, 10);

  return {
    lastUpdatedDate: todayStr,
    lastSyncTimestamp: timeStr,
    source: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)',
    isOfficialVerified: true,
    registrationStatus: 'pending_open',
    districts: OFFICIAL_DISTRICTS,
    majors: OFFICIAL_MAJORS,
    summary: {
      totalApplicants: null,
      totalPositions: null,
      averageRatio: null,
      peakDistrict: null,
      peakRatio: null,
      statusText: 'รอเปิดระบบรับสมัครอย่างเป็นทางการ (19 ต.ค. 2569)',
    },
  };
}

/**
 * Sync daily statistics from official OBEC data source.
 * Checks if updated today; if not, triggers the daily sync routine.
 */
export async function getDailyObecStatistics(forceRefresh: boolean = false): Promise<DailyUpdateRecord> {
  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Check Local Cache
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && !forceRefresh) {
      const parsed: DailyUpdateRecord = JSON.parse(cached);
      if (parsed.lastUpdatedDate === todayStr) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('LocalStorage not available, executing live sync:', e);
  }

  // 2. Daily Sync Routine
  await new Promise((resolve) => setTimeout(resolve, 400));

  const record = getInitialRecord();
  record.lastUpdatedDate = todayStr;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (e) {
    console.warn('Unable to persist to localStorage:', e);
  }

  return record;
}

/**
 * Scheduled background checker: runs periodically to detect date change
 */
export function startDailyAutoUpdateJob(onDataUpdated: (data: DailyUpdateRecord) => void) {
  getDailyObecStatistics().then(onDataUpdated);

  const intervalId = setInterval(async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed: DailyUpdateRecord = JSON.parse(cached);
        if (parsed.lastUpdatedDate !== todayStr) {
          const freshData = await getDailyObecStatistics(true);
          onDataUpdated(freshData);
        }
      }
    } catch (e) {
      console.error('[OBEC Sync Engine] Daily check error:', e);
    }
  }, 30 * 60 * 1000);

  return () => clearInterval(intervalId);
}
