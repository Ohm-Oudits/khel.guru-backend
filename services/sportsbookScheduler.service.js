import SportsEvent from "../models/sportsEvent.model.js";
import { canSpend } from "./providerUsage.service.js";
import { runSportsbookIngest } from "./sportsbookIngest.service.js";

// Interval-loop scheduler (slide.service.js precedent). Every loop wraps its
// body in try/catch and an in-flight guard so a slow tick never overlaps the
// next one. Loops with a non-positive period are disabled.

const envMs = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
};

const liveSportKeys = () =>
  (process.env.SPORTSBOOK_LIVE_SPORT_KEYS || "cricket_ipl,soccer_epl")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const estimatedOddsCost = () => {
  const regions = (process.env.THE_ODDS_API_REGIONS || "uk").split(",").filter(Boolean);
  const markets = (process.env.THE_ODDS_API_MARKETS || "h2h,totals").split(",").filter(Boolean);
  return Math.max(1, regions.length * markets.length);
};

const likelyDurationMs = (sportGroup) => {
  const hours = { football: 3, cricket: 5 }[sportGroup] || 6;
  return hours * 60 * 60 * 1000;
};

// Settlement (prompt 29) plugs in through a lazy import so the scheduler
// compiles and runs before the scores pipeline exists.
let scoresModule;
const loadScoresPipeline = async () => {
  if (scoresModule === undefined) {
    const ingest = await import("./sportsbookIngest.service.js");
    let settlement = null;
    try {
      settlement = await import("./betSettlement.service.js");
    } catch {
      settlement = null;
    }
    scoresModule = {
      runScoresIngest: ingest.runScoresIngest || null,
      settleEvent: settlement?.settleEvent || null,
      voidEvent: settlement?.voidEvent || null,
    };
  }
  return scoresModule;
};

const loops = new Map();

const registerLoop = (name, intervalMs, tick) => {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    loops.set(name, { intervalMs, timer: null, enabled: false });
    return;
  }

  const state = {
    intervalMs,
    enabled: true,
    running: false,
    runs: 0,
    lastRunAt: null,
    lastError: null,
    timer: null,
  };

  state.timer = setInterval(async () => {
    if (state.running) return;
    state.running = true;

    try {
      await tick();
      state.lastError = null;
    } catch (error) {
      state.lastError = error.message;
      console.error(`Sportsbook scheduler loop ${name} failed:`, error.message);
    } finally {
      state.runs += 1;
      state.lastRunAt = new Date();
      state.running = false;
    }
  }, intervalMs);

  if (typeof state.timer.unref === "function") {
    state.timer.unref();
  }

  loops.set(name, state);
};

const flipStartedEventsLive = async (onFlipped = null) => {
  const dueEvents = await SportsEvent.find(
    {
      provider: "the-odds-api",
      status: "upcoming",
      startTime: { $lte: new Date() },
    },
    { _id: 1, sportGroup: 1, sportKey: 1, startTime: 1 }
  ).lean();

  if (!dueEvents.length) return [];

  await SportsEvent.updateMany(
    { _id: { $in: dueEvents.map((event) => event._id) } },
    { $set: { status: "live" } }
  );

  if (onFlipped) {
    await onFlipped(dueEvents);
  }

  return dueEvents;
};

const simTick = async () => {
  const result = await runSportsbookIngest({ provider: "simulated" });

  const { settleEvent } = await loadScoresPipeline();
  if (settleEvent) {
    const completed = await SportsEvent.find(
      {
        provider: "simulated",
        status: { $in: ["upcoming", "live"] },
        "scoreboard.completed": true,
      },
      { _id: 1 }
    ).lean();

    for (const event of completed) {
      await settleEvent(event._id, { actor: { type: "system" } });
    }
  }

  return result;
};

const oddsTick = async ({ liveOnly }) => {
  let sportKeys = liveSportKeys();

  if (liveOnly) {
    const liveKeys = await SportsEvent.distinct("sportKey", {
      provider: "the-odds-api",
      status: "live",
    });
    sportKeys = sportKeys.filter((key) => liveKeys.includes(key));
    if (!sportKeys.length) return;
  }

  for (const sportKey of sportKeys) {
    const verdict = await canSpend("the-odds-api", {
      estimatedCost: estimatedOddsCost(),
      purpose: "odds",
    });

    if (!verdict.allowed) {
      console.warn(
        `Sportsbook odds poll skipped for ${sportKey}: ${verdict.reason}`
      );
      return;
    }

    await runSportsbookIngest({ provider: "the-odds-api", sportKey });
  }

  await flipStartedEventsLive();
};

const scoresLiveTick = async () => {
  const { runScoresIngest } = await loadScoresPipeline();
  if (!runScoresIngest) return;

  const liveKeys = await SportsEvent.distinct("sportKey", {
    provider: "the-odds-api",
    status: "live",
  });

  for (const sportKey of liveKeys) {
    const verdict = await canSpend("the-odds-api", {
      estimatedCost: 2,
      purpose: "scores",
    });
    if (!verdict.allowed) return;

    await runScoresIngest({ sportKey });
  }
};

const scoresSweepTick = async () => {
  const { runScoresIngest, voidEvent } = await loadScoresPipeline();
  if (!runScoresIngest) return;

  const now = Date.now();
  const staleEvents = await SportsEvent.find(
    {
      provider: "the-odds-api",
      status: { $in: ["upcoming", "live"] },
    },
    { _id: 1, sportKey: 1, sportGroup: 1, startTime: 1 }
  ).lean();

  const likelyFinished = staleEvents.filter(
    (event) =>
      now - new Date(event.startTime).getTime() > likelyDurationMs(event.sportGroup)
  );

  const sportKeys = Array.from(new Set(likelyFinished.map((event) => event.sportKey)));

  for (const sportKey of sportKeys) {
    const verdict = await canSpend("the-odds-api", {
      estimatedCost: 2,
      purpose: "scores",
    });
    if (!verdict.allowed) return;

    await runScoresIngest({ sportKey, daysFrom: 2 });
  }

  // Events far past their start with no resolution get voided so player
  // stakes are never stranded.
  if (voidEvent) {
    const voidAfterMs =
      Number(process.env.SPORTSBOOK_VOID_AFTER_DAYS || 3) * 24 * 60 * 60 * 1000;

    const abandoned = likelyFinished.filter(
      (event) => now - new Date(event.startTime).getTime() > voidAfterMs
    );

    for (const event of abandoned) {
      const fresh = await SportsEvent.findById(event._id, { status: 1 }).lean();
      if (fresh && ["upcoming", "live"].includes(fresh.status)) {
        await voidEvent(event._id, "no-final-score-within-window");
      }
    }
  }
};

export const startSportsbookScheduler = () => {
  if (loops.size > 0) return;

  const defaultProvider = process.env.SPORTSBOOK_DEFAULT_PROVIDER || "mock";
  const simEnabled =
    defaultProvider === "simulated" || process.env.SPORTSBOOK_SIM_ALWAYS === "true";
  const oddsEnabled = Boolean(process.env.THE_ODDS_API_KEY);

  registerLoop(
    "simTick",
    simEnabled ? envMs("SPORTSBOOK_SIM_TICK_MS", 15000) : 0,
    simTick
  );
  registerLoop(
    "oddsUpcoming",
    oddsEnabled ? envMs("SPORTSBOOK_ODDS_POLL_UPCOMING_MS", 43200000) : 0,
    () => oddsTick({ liveOnly: false })
  );
  registerLoop(
    "oddsLive",
    oddsEnabled ? envMs("SPORTSBOOK_ODDS_POLL_LIVE_MS", 900000) : 0,
    () => oddsTick({ liveOnly: true })
  );
  registerLoop(
    "scoresLive",
    oddsEnabled ? envMs("SPORTSBOOK_SCORES_POLL_MS", 300000) : 0,
    scoresLiveTick
  );
  registerLoop(
    "scoresSweep",
    oddsEnabled ? envMs("SPORTSBOOK_SCORES_SWEEP_MS", 21600000) : 0,
    scoresSweepTick
  );

  console.log(
    `Sportsbook scheduler started (${Array.from(loops.entries())
      .filter(([, state]) => state.enabled)
      .map(([name]) => name)
      .join(", ") || "no loops enabled"})`
  );
};

export const stopSportsbookScheduler = () => {
  for (const [, state] of loops) {
    if (state.timer) clearInterval(state.timer);
  }
  loops.clear();
};

export const getSchedulerStatus = () => ({
  loops: Array.from(loops.entries()).map(([name, state]) => ({
    name,
    enabled: state.enabled,
    intervalMs: state.intervalMs,
    runs: state.runs || 0,
    lastRunAt: state.lastRunAt || null,
    lastError: state.lastError || null,
    running: Boolean(state.running),
  })),
});
