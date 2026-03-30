/**
 * Churn feature signals — decay-based metrics comparing recent vs historical
 * engagement windows to detect disengagement trends.
 */
export interface ChurnFeatures {
  // Email engagement decay
  responseTimeRecent: number | null; // avg response time (hours) last 30d
  responseTimeHistorical: number | null; // avg response time (hours) 31-90d
  responseDecayRatio: number | null; // recent/historical (>1 = slower = bad)
  repliedRatioRecent: number; // reply rate last 30d
  repliedRatioHistorical: number; // reply rate 31-90d

  // Meeting frequency
  meetingCountCurrentQ: number; // meetings this quarter
  meetingCountPreviousQ: number; // meetings previous quarter
  meetingDropRatio: number | null; // current/previous (<1 = drop = bad)

  // Deal stagnation
  maxStageDaysVsAvg: number | null; // days in current stage / avg stage duration
  staleDealCount: number; // deals with no activity >30d

  // Inactivity
  daysSinceLastInteraction: number | null;
  inactivityStreakDays: number; // consecutive days with zero interaction
  emailBounceCount: number; // bounced emails last 90d

  // Volume trends
  activityCount30d: number;
  activityCount90d: number;
  activityDecayRatio: number | null; // (30d * 3) / 90d — normalized, <1 = declining
}
