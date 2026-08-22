const envMs = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const oddsSyncIntervalsMs = () => ({
  live: envMs("SPORTSBOOK_ODDS_LIVE_MS", 20_000),
  withinHour: envMs("SPORTSBOOK_ODDS_WITHIN_HOUR_MS", 60_000),
  within6h: envMs("SPORTSBOOK_ODDS_WITHIN_6H_MS", 5 * 60_000),
  within24h: envMs("SPORTSBOOK_ODDS_WITHIN_24H_MS", 15 * 60_000),
  later: envMs("SPORTSBOOK_ODDS_LATER_MS", 45 * 60_000),
});

export const isTerminalSportsStatus = (event = {}) =>
  event.completed === true ||
  event.status === "settled" ||
  event.status === "cancelled";

export const computeNextOddsSyncAt = (
  event = {},
  now = Date.now(),
  { immediate = false } = {}
) => {
  if (isTerminalSportsStatus(event)) return null;
  if (immediate) return new Date(now);

  const intervals = oddsSyncIntervalsMs();
  if (event.status === "live") {
    return new Date(now + intervals.live);
  }

  const start = new Date(event.startTime || event.date || 0).getTime();
  const remaining = start - now;
  if (!Number.isFinite(start) || remaining <= 0) {
    return new Date(now + intervals.live);
  }
  if (remaining <= 60 * 60 * 1000) return new Date(now + intervals.withinHour);
  if (remaining <= 6 * 60 * 60 * 1000) return new Date(now + intervals.within6h);
  if (remaining <= 24 * 60 * 60 * 1000) {
    return new Date(now + intervals.within24h);
  }
  return new Date(now + intervals.later);
};

export const dueOddsEventFilter = (now = new Date()) => ({
  provider: "odds-api-io",
  status: { $in: ["live", "upcoming"] },
  $or: [
    { nextSyncAt: { $lte: now } },
    { nextSyncAt: null },
    { nextSyncAt: { $exists: false } },
  ],
});
