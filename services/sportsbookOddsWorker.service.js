import SportsEvent from "../models/sportsEvent.model.js";
import { publishIngestChanges } from "../socket/modules/sports/sports.emitter.js";
import { pushSportSnapshots } from "./liveBoard.service.js";
import { recordUsage } from "./providerUsage.service.js";
import {
  oddsPayloadChanged,
  setCachedOdds,
  setCachedSportBoard,
} from "./sportsbookOddsCache.service.js";
import {
  applyOddsApiIoBookmakers,
  fetchOddsApiIoOddsMulti,
} from "./sportsbookProviders/oddsApiIoProvider.js";
import { ingestNormalizedSportsbookFeed } from "./sportsbookIngest.service.js";
import {
  computeNextOddsSyncAt,
  dueOddsEventFilter,
} from "./sportsbookSyncSchedule.js";

const toItem = (event) => ({
  provider: event.provider,
  providerEventId: event.providerEventId,
  sportKey: event.sportKey,
  sportName: event.sportName,
  leagueName: event.leagueName,
  status: event.status,
  startTime: event.startTime,
  competitors: event.competitors || [],
  scoreboard: event.scoreboard || {},
  metadata: event.metadata || {},
  markets: [],
});

const markSynced = async (event, now = new Date()) => {
  await SportsEvent.updateOne(
    { _id: event._id },
    {
      $set: {
        lastSyncedAt: now,
        nextSyncAt: computeNextOddsSyncAt(event, now.getTime()),
      },
    }
  );
};

const dueRank = (event) => {
  const key = String(event.sportKey || event.sportGroup || "");
  if (event.status === "live") return 0;
  if (key.startsWith("football") || event.sportGroup === "football") return 1;
  if (key.startsWith("tennis") || event.sportGroup === "tennis") return 2;
  return 3;
};

export const listDueOddsEvents = async ({ limit = 40, now = new Date() } = {}) => {
  const rows = await SportsEvent.find(dueOddsEventFilter(now))
    .sort({ startTime: 1 })
    .limit(Math.max(limit * 3, limit))
    .lean();
  return rows.sort((left, right) => dueRank(left) - dueRank(right)).slice(0, limit);
};

export const runDueOddsTick = async ({ limit = 40 } = {}) => {
  const due = await listDueOddsEvents({ limit });
  if (!due.length) {
    return { due: 0, priced: 0, changed: 0, usage: { cost: 0 } };
  }

  const byId = new Map(due.map((event) => [String(event.providerEventId), event]));
  let usage = { cost: 0 };
  const pricedItems = [];
  let changed = 0;

  for (let index = 0; index < due.length; index += 10) {
    const chunk = due.slice(index, index + 10);
    const result = await fetchOddsApiIoOddsMulti({
      eventIds: chunk.map((event) => event.providerEventId),
    });
    usage = result.usage || usage;
    const payloads = new Map(
      (result.odds || []).map((payload) => [
        String(payload.id || payload.eventId || ""),
        payload,
      ])
    );

    for (const event of chunk) {
      const id = String(event.providerEventId);
      const payload = payloads.get(id);
      if (!payload?.bookmakers) {
        await markSynced(byId.get(id));
        continue;
      }
      const item = applyOddsApiIoBookmakers(toItem(event), payload);
      const slim = {
        eventId: id,
        bookmakers: payload.bookmakers,
        updatedAt: new Date().toISOString(),
      };
      if (await oddsPayloadChanged(id, slim)) {
        await setCachedOdds(id, slim);
        pricedItems.push(item);
        changed += 1;
      } else {
        await markSynced(event);
      }
    }
  }

  let ingested = { events: [], changes: [] };
  if (pricedItems.length) {
    ingested = await ingestNormalizedSportsbookFeed(pricedItems);
    publishIngestChanges(ingested.changes || []);
    await pushSportSnapshots(
      (ingested.changes || []).map((change) => change.sportGroup)
    );
    const now = new Date();
    await SportsEvent.updateMany(
      { _id: { $in: ingested.events.map((event) => event._id) } },
      { $set: { lastSyncedAt: now } }
    );
    for (const event of ingested.events) {
      await SportsEvent.updateOne(
        { _id: event._id },
        { $set: { nextSyncAt: computeNextOddsSyncAt(event, now.getTime()) } }
      );
    }
  }

  await recordUsage("odds-api-io", usage);
  return {
    due: due.length,
    priced: pricedItems.length,
    changed,
    ingestedCount: ingested.events.length,
    changes: ingested.changes?.length || 0,
    usage,
  };
};

export const refreshSportBoardCaches = async (sportGroups = []) => {
  const unique = [...new Set(sportGroups.filter(Boolean))];
  for (const sport of unique) {
    const [live, upcoming] = await Promise.all([
      SportsEvent.find(
        { provider: "odds-api-io", sportGroup: sport, status: "live" },
        { providerEventId: 1 }
      ).lean(),
      SportsEvent.find(
        { provider: "odds-api-io", sportGroup: sport, status: "upcoming" },
        { providerEventId: 1 }
      ).lean(),
    ]);
    await setCachedSportBoard(
      sport,
      "live",
      live.map((event) => event.providerEventId)
    );
    await setCachedSportBoard(
      sport,
      "upcoming",
      upcoming.map((event) => event.providerEventId)
    );
  }
};
