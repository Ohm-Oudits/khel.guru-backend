import SportsEvent from "../models/sportsEvent.model.js";
import { emitEventState } from "../socket/modules/sports/sports.emitter.js";
import { pushLiveBoards } from "./liveBoard.service.js";
import {
  refreshSportBoardCaches,
  runDueOddsTick,
} from "./sportsbookOddsWorker.service.js";
import { runLiveCricketScorePoll } from "./liveCricketScore.service.js";
import { driftLiveEventOdds } from "./liveOddsSim.service.js";
import { canSpend, recordUsage } from "./providerUsage.service.js";
import { ODDS_API_IO_SPORT_SLUGS } from "./sportsbookCatalog.service.js";
import { runSportsbookIngest } from "./sportsbookIngest.service.js";
import { resolveOddsSportKeys } from "./sportsbookSportKeys.js";
import { pingSportsbookCache } from "./sportsbookOddsCache.service.js";

let oddsApiIoCatalogCursor = 0;

const nextOddsApiIoSportBatch = () => {
  const slugs = ODDS_API_IO_SPORT_SLUGS;
  const parsed = Number.parseInt(process.env.SPORTSBOOK_ODDS_IO_SPORT_BATCH || "4", 10);
  const batch = Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
  const sports = [];
  for (let index = 0; index < batch; index += 1) {
    sports.push(slugs[(oddsApiIoCatalogCursor + index) % slugs.length]);
  }
  oddsApiIoCatalogCursor = (oddsApiIoCatalogCursor + batch) % slugs.length;
  return sports;
};

// Interval-loop scheduler (slide.service.js precedent). Every loop wraps its
// body in try/catch and an in-flight guard so a slow tick never overlaps the
// next one. Loops with a non-positive period are disabled.

const envMs = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
};

const liveSportKeys = () => resolveOddsSportKeys();

const estimatedOddsCost = () => {
  const regions = (process.env.THE_ODDS_API_REGIONS || "uk").split(",").filter(Boolean);
  const markets = (process.env.THE_ODDS_API_MARKETS || "h2h,totals").split(",").filter(Boolean);
  return Math.max(1, regions.length * markets.length);
};

const likelyDurationMs = (sportGroup) => {
  const hours = { football: 3, soccer: 3, cricket: 5 }[sportGroup] || 6;
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
let lastOddsSkipLogAt = 0;

const runTick = async (name, state, tick) => {
  if (state.running) return;
  if (state.cooldownUntil && Date.now() < state.cooldownUntil) return;
  state.running = true;

  try {
    await tick();
    state.lastError = null;
    state.cooldownUntil = 0;
  } catch (error) {
    state.lastError = error.message;
    if (/429|rate.?limit/i.test(error.message || "")) {
      state.cooldownUntil =
        Date.now() + envMs("SPORTSBOOK_ODDS_IO_429_COOLDOWN_MS", 90000);
      console.warn(
        `Sportsbook scheduler loop ${name} rate-limited, cooling down ${state.cooldownUntil - Date.now()}ms`
      );
    } else {
      console.error(`Sportsbook scheduler loop ${name} failed:`, error.message);
    }
  } finally {
    state.runs += 1;
    state.lastRunAt = new Date();
    state.running = false;
  }
};

const registerLoop = (name, intervalMs, tick, { immediate = false } = {}) => {
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
    cooldownUntil: 0,
    timer: null,
  };

  state.timer = setInterval(() => {
    runTick(name, state, tick);
  }, intervalMs);

  if (typeof state.timer.unref === "function") {
    state.timer.unref();
  }

  loops.set(name, state);
  if (immediate) {
    runTick(name, state, tick);
  }
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

  for (const event of dueEvents) {
    emitEventState({
      eventId: event._id,
      sportGroup: event.sportGroup,
      status: "live",
      previousStatus: "upcoming",
      startTime: event.startTime,
    });
  }

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
  let sportKeys = await liveSportKeys();

  if (liveOnly) {
    const liveKeys = await SportsEvent.distinct("sportKey", {
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
      if (Date.now() - lastOddsSkipLogAt > 30000) {
        lastOddsSkipLogAt = Date.now();
        console.warn(
          `Sportsbook odds poll skipped: ${verdict.reason} remaining=${verdict.remainingReported}`
        );
      }
      return;
    }

    try {
      const result = await runSportsbookIngest({
        provider: "the-odds-api",
        sportKey,
      });
      console.log(
        `oddsLive sport=${sportKey} ingested=${result.ingestedCount} changes=${result.changes.length}`
      );
    } catch (error) {
      const status = error.response?.status;
      if (status === 404) {
        console.warn(`Sportsbook odds poll skipped unknown sport ${sportKey}`);
        continue;
      }
      if (status === 401 || status === 429) {
        const headers = error.response.headers || {};
        const remaining = Number.parseFloat(headers["x-requests-remaining"]);
        await recordUsage("the-odds-api", {
          used: Number.parseFloat(headers["x-requests-used"]),
          remaining: Number.isFinite(remaining) ? remaining : 0,
          cost: Number.parseFloat(headers["x-requests-last"]),
        });
        console.warn(
          `Sportsbook odds poll halted: Odds API ${status} remaining=${
            Number.isFinite(remaining) ? remaining : 0
          }`
        );
        return;
      }
      throw error;
    }
  }

  await flipStartedEventsLive();
};

const scoresLiveTick = async () => {
  const { runScoresIngest } = await loadScoresPipeline();
  if (!runScoresIngest) return;

  const knownKeys = new Set(await liveSportKeys());
  const liveKeys = (await SportsEvent.distinct("sportKey", { status: "live" }))
    .filter((key) => knownKeys.has(key));

  for (const sportKey of liveKeys) {
    const verdict = await canSpend("the-odds-api", {
      estimatedCost: 2,
      purpose: "scores",
    });
    if (!verdict.allowed) return;

    try {
      await runScoresIngest({ sportKey });
    } catch (error) {
      if (error.response?.status === 404) {
        console.warn(`Sportsbook scores poll skipped unknown sport ${sportKey}`);
        continue;
      }
      throw error;
    }
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

  pingSportsbookCache().catch((error) => {
    console.warn(`sportsbook Redis warmup failed: ${error.message}`);
  });

  const defaultProvider = process.env.SPORTSBOOK_DEFAULT_PROVIDER || "mock";
  const ioOnly =
    process.env.SPORTSBOOK_IO_ONLY === "true" ||
    defaultProvider === "odds-api-io";
  const simEnabled =
    !ioOnly &&
    (defaultProvider === "simulated" || process.env.SPORTSBOOK_SIM_ALWAYS === "true");
  const oddsEnabled = Boolean(process.env.THE_ODDS_API_KEY) && !ioOnly;

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
    oddsEnabled ? envMs("SPORTSBOOK_ODDS_POLL_LIVE_MS", 3000) : 0,
    () => oddsTick({ liveOnly: true }),
    { immediate: true }
  );
  registerLoop(
    "scoresLive",
    oddsEnabled ? envMs("SPORTSBOOK_SCORES_POLL_MS", 3000) : 0,
    scoresLiveTick,
    { immediate: true }
  );
  registerLoop(
    "scoresSweep",
    oddsEnabled ? envMs("SPORTSBOOK_SCORES_SWEEP_MS", 21600000) : 0,
    scoresSweepTick
  );
  // ESPN/Cricbuzz score scrape — unused when Odds-API.io is the only source.
  registerLoop(
    "cricketLive",
    ioOnly ? 0 : envMs("SPORTSBOOK_CRICKET_POLL_MS", 3000),
    runLiveCricketScorePoll,
    { immediate: !ioOnly }
  );
  registerLoop(
    "oddsApiIoLiveState",
    process.env.ODDS_API_IO_KEY
      ? envMs("SPORTSBOOK_ODDS_IO_LIVE_STATE_MS", 15000)
      : 0,
    async () => {
      const result = await runSportsbookIngest({
        provider: "odds-api-io",
        ioMode: "live-state",
      });
      await refreshSportBoardCaches(
        result.changes.map((change) => change.sportGroup)
      );
      console.log(
        `oddsApiIoLiveState ingested=${result.ingestedCount} changes=${result.changes.length}`
      );
    },
    { immediate: true }
  );
  registerLoop(
    "oddsApiIoDiscover",
    process.env.ODDS_API_IO_KEY
      ? envMs("SPORTSBOOK_ODDS_IO_DISCOVER_MS", 300000)
      : 0,
    async () => {
      const result = await runSportsbookIngest({
        provider: "odds-api-io",
        ioMode: "discover",
      });
      await refreshSportBoardCaches(["football", "tennis", "cricket"]);
      console.log(
        `oddsApiIoDiscover ingested=${result.ingestedCount} changes=${result.changes.length}`
      );
    },
    { immediate: true }
  );
  registerLoop(
    "oddsApiIoOdds",
    process.env.ODDS_API_IO_KEY
      ? envMs("SPORTSBOOK_ODDS_IO_ODDS_MS", 15000)
      : 0,
    async () => {
      const result = await runDueOddsTick({
        limit: Number.parseInt(process.env.SPORTSBOOK_ODDS_IO_DUE_LIMIT || "40", 10) || 40,
      });
      console.log(
        `oddsApiIoOdds due=${result.due} priced=${result.priced} changed=${result.changed}`
      );
    },
    { immediate: true }
  );
  registerLoop(
    "oddsApiIoCatalog",
    process.env.ODDS_API_IO_KEY
      ? envMs("SPORTSBOOK_ODDS_IO_CATALOG_POLL_MS", 900000)
      : 0,
    async () => {
      const sports = nextOddsApiIoSportBatch();
      const result = await runSportsbookIngest({
        provider: "odds-api-io",
        ioMode: "catalog",
        sports,
      });
      console.log(
        `oddsApiIoCatalog sports=${sports.join(",")} ingested=${result.ingestedCount} changes=${result.changes.length}`
      );
    }
  );
  registerLoop(
    "oddsApiIoLive",
    process.env.ODDS_API_IO_KEY
      ? envMs("SPORTSBOOK_ODDS_IO_POLL_MS", 0)
      : 0,
    async () => {
      const result = await runSportsbookIngest({
        provider: "odds-api-io",
        ioMode: "live",
      });
      console.log(
        `oddsApiIoLive ingested=${result.ingestedCount} changes=${result.changes.length}`
      );
    }
  );
  registerLoop(
    "liveBoardPush",
    ioOnly ? 0 : envMs("SPORTSBOOK_LIVE_BOARD_PUSH_MS", 1000),
    pushLiveBoards,
    { immediate: !ioOnly }
  );
  // Drift prices on current live boards when The Odds API is unavailable.
  registerLoop(
    "oddsSimLive",
    process.env.SPORTSBOOK_SIM_LIVE_ODDS === "false"
      ? 0
      : envMs("SPORTSBOOK_ODDS_SIM_LIVE_MS", 3000),
    driftLiveEventOdds,
    { immediate: true }
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
