import crypto from "crypto";

import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import { publishIngestChanges } from "../socket/modules/sports/sports.emitter.js";
import { recordUsage } from "./providerUsage.service.js";
import {
  ioSlugForSportGroup,
  resolveSportGroup,
} from "./sportsbookCatalog.service.js";
import {
  fetchMockSportsbookFeed,
} from "./sportsbookProviders/mockSportsbookProvider.js";
import {
  fetchSimulatedLiveFeed,
} from "./sportsbookProviders/simulatedLiveProvider.js";
import { eventPairKey, isSportsbookIoOnly } from "./sportsbookEvents.service.js";
import {
  fetchTheOddsApiOdds,
  fetchTheOddsApiScores,
  fetchTheOddsApiSports,
} from "./sportsbookProviders/theOddsApiProvider.js";
import { resolveOddsSportKeys } from "./sportsbookSportKeys.js";
import { fetchOddsApiIoFeed } from "./sportsbookProviders/oddsApiIoProvider.js";
import { pushSportSnapshots } from "./liveBoard.service.js";
import { computeNextOddsSyncAt } from "./sportsbookSyncSchedule.js";

const normalizeDate = (value) => (value ? new Date(value) : new Date());

// Canonical odds fingerprint: equal signature means no snapshot insert.
export const computeOddsSignature = (outcomes = []) =>
  crypto
    .createHash("sha1")
    .update(
      JSON.stringify(
        outcomes
          .map((outcome) => [outcome.key, outcome.priceDecimal, outcome.line ?? null])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      )
    )
    .digest("hex");

const scoreboardChanged = (previous = {}, next = {}) =>
  JSON.stringify(previous || {}) !== JSON.stringify(next || {});

const hasScoreboard = (scoreboard) =>
  Boolean(scoreboard) && Object.keys(scoreboard).length > 0;

const findHouseEventForItem = async (item) => {
  if (isSportsbookIoOnly()) return null;
  if (item.provider === "mock") return null;
  // Completed rows must not attach to a live house board (AUS–BAN Test
  // was settled because a different same-pair result arrived).
  if (item.completed || item.status === "settled") return null;

  const pair = eventPairKey({
    ...item,
    sportGroup: resolveSportGroup(item.sportKey),
  });
  if (!pair) return null;

  const candidates = await SportsEvent.find({
    sportGroup: resolveSportGroup(item.sportKey),
    status: { $in: ["live", "upcoming"] },
  });

  const matches = candidates.filter((event) => eventPairKey(event) === pair);
  return (
    matches.find((event) => event.provider === "mock") || matches[0] || null
  );
};

const upsertEvent = async (item) => {
  const existing = await SportsEvent.findOne(
    {
      provider: item.provider,
      providerEventId: item.providerEventId,
    },
    { metadata: 1, status: 1, nextSyncAt: 1, lastSyncedAt: 1 }
  ).lean();
  const terminal = item.completed === true || item.status === "settled" || item.status === "cancelled";
  let nextSyncAt = existing?.nextSyncAt || null;
  if (terminal) {
    nextSyncAt = null;
  } else if (!existing || existing.status !== item.status || !existing.nextSyncAt) {
    nextSyncAt = computeNextOddsSyncAt(item, Date.now(), {
      immediate: !existing || existing.status !== item.status,
    });
  }
  const next = {
    sportKey: item.sportKey,
    sportGroup: resolveSportGroup(item.sportKey),
    sportName: item.sportName,
    leagueName: item.leagueName,
    countryCode: item.countryCode || "",
    status: item.status,
    startTime: normalizeDate(item.startTime),
    competitors: item.competitors || [],
    providerLastUpdate: item.providerLastUpdate
      ? normalizeDate(item.providerLastUpdate)
      : null,
    lastSyncedAt: existing?.lastSyncedAt || null,
    nextSyncAt,
    metadata: { ...(existing?.metadata || {}), ...(item.metadata || {}) },
    rawPayload: item.rawPayload || {},
  };

  if (hasScoreboard(item.scoreboard)) {
    next.scoreboard = item.scoreboard;
  }

  return SportsEvent.findOneAndUpdate(
    {
      provider: item.provider,
      providerEventId: item.providerEventId,
    },
    { $set: next },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const isExchangeBookmaker = (key = "") =>
  /^(betfair_ex|betfair_exchange|matchbook|smarkets)/i.test(String(key));

const isHouseBookmaker = (key = "") =>
  /^(mockbook|mock|simulated|simbook)$/i.test(String(key));

const isLayMarket = (marketKey = "") => /_lay$/i.test(String(marketKey));

// Board price: pin SPORTSBOOK_PRIMARY_BOOKMAKER when set. Otherwise prefer
// exchanges — best back is MAX, best lay is MIN — then sportsbooks (MAX).
// House mock quotes never beat a real Odds API book. betfair_sb_* is a
// sportsbook, not an exchange.
const denormalizeSelectionPrices = ({
  selections,
  latestOdds,
  now,
  marketKey = "",
}) => {
  const primaryKey = process.env.SPORTSBOOK_PRIMARY_BOOKMAKER || null;
  const realOdds = latestOdds.filter(
    (entry) => !isHouseBookmaker(entry.bookmakerKey)
  );
  const sourceOdds = realOdds.length ? realOdds : latestOdds;
  const primaryBook =
    primaryKey &&
    sourceOdds.find((entry) => entry.bookmakerKey === primaryKey);
  const exchanges = sourceOdds.filter((entry) =>
    isExchangeBookmaker(entry.bookmakerKey)
  );
  const sportsbooks = sourceOdds.filter(
    (entry) => !isExchangeBookmaker(entry.bookmakerKey)
  );
  const lay = isLayMarket(marketKey);
  const betterThan = (existing, next) =>
    existing === undefined || (lay ? next < existing : next > existing);

  const priceByKey = new Map();

  const books = primaryBook
    ? [primaryBook]
    : exchanges.length
      ? exchanges
      : sportsbooks.length
        ? sportsbooks
        : sourceOdds;
  for (const book of books) {
    for (const outcome of book.outcomes || []) {
      if (betterThan(priceByKey.get(outcome.key), outcome.priceDecimal)) {
        priceByKey.set(outcome.key, outcome.priceDecimal);
      }
    }
  }

  return selections.map((selection) => {
    const price = priceByKey.get(selection.key);
    if (price === undefined) return selection;
    if (selection.priceDecimal === price) return selection;

    return {
      ...selection,
      priceDecimal: price,
      priceUpdatedAt: now,
    };
  });
};

const mergeSelections = ({ incoming = [], existing = [] }) => {
  const existingByKey = new Map(existing.map((entry) => [entry.key, entry]));

  return incoming.map((selection) => {
    const previous = existingByKey.get(selection.key);

    return {
      key: selection.key,
      name: selection.name,
      line: selection.line ?? null,
      status: previous?.status || selection.status || "open",
      priceDecimal: previous?.priceDecimal ?? null,
      priceUpdatedAt: previous?.priceUpdatedAt ?? null,
    };
  });
};

const applyMarket = async ({ event, provider, market }) => {
  const existing = await Market.findOne({
    eventId: event._id,
    provider,
    providerMarketKey: market.providerMarketKey,
  });

  const now = new Date();
  const incomingSnapshots = market.snapshots || [];
  const previousLatestOdds = existing?.latestOdds
    ? existing.latestOdds.map((entry) =>
        typeof entry.toObject === "function" ? entry.toObject() : entry
      )
    : [];

  const latestOddsByBook = new Map(
    previousLatestOdds.map((entry) => [entry.bookmakerKey, entry])
  );

  const changedBookmakers = [];

  for (const snapshot of incomingSnapshots) {
    const signature = computeOddsSignature(snapshot.outcomes || []);
    const previous = latestOddsByBook.get(snapshot.bookmakerKey);

    if (previous?.signature === signature) {
      continue;
    }

    latestOddsByBook.set(snapshot.bookmakerKey, {
      bookmakerKey: snapshot.bookmakerKey,
      bookmakerTitle: snapshot.bookmakerTitle || "",
      region: snapshot.region || "",
      capturedAt: normalizeDate(snapshot.capturedAt),
      signature,
      outcomes: snapshot.outcomes || [],
    });

    changedBookmakers.push({
      bookmakerKey: snapshot.bookmakerKey,
      bookmakerTitle: snapshot.bookmakerTitle || "",
      capturedAt: normalizeDate(snapshot.capturedAt),
      outcomes: snapshot.outcomes || [],
    });
  }

  const oddsChanged = changedBookmakers.length > 0;
  const latestOdds = Array.from(latestOddsByBook.values());

  let selections = mergeSelections({
    incoming: market.selections || [],
    existing: existing?.selections || [],
  });

  if (oddsChanged || !existing) {
    selections = denormalizeSelectionPrices({
      selections,
      latestOdds,
      now,
      marketKey: market.providerMarketKey,
    });
  }

  const marketDocument = await Market.findOneAndUpdate(
    {
      eventId: event._id,
      provider,
      providerMarketKey: market.providerMarketKey,
    },
    {
      $set: {
        marketType: market.marketType || "other",
        title: market.title,
        status: existing?.status === "settled" ? "settled" : market.status || "open",
        selections,
        latestOdds,
        bookmakerCount: latestOdds.length,
        latestSnapshotAt: oddsChanged ? now : existing?.latestSnapshotAt || null,
        metadata: market.metadata || {},
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (oddsChanged) {
    for (const change of changedBookmakers) {
      try {
        await OddsSnapshot.create({
          eventId: event._id,
          marketId: marketDocument._id,
          provider,
          bookmakerKey: change.bookmakerKey,
          bookmakerTitle: change.bookmakerTitle || change.bookmakerKey,
          region:
            latestOddsByBook.get(change.bookmakerKey)?.region || "",
          capturedAt: change.capturedAt,
          providerLastUpdate: null,
          outcomes: change.outcomes,
        });
      } catch (error) {
        // Unique index race on identical capturedAt: already recorded.
        if (error?.code !== 11000) throw error;
      }
    }
  }

  return {
    marketId: marketDocument._id,
    providerMarketKey: market.providerMarketKey,
    marketType: marketDocument.marketType,
    changed: oddsChanged,
    changedBookmakers,
  };
};

export const ingestNormalizedSportsbookFeed = async (items) => {
  const ingestedEvents = [];
  const changes = [];

  for (const item of items) {
    const wantsSettle = item.completed === true || item.status === "settled";
    const persistItem = wantsSettle ? { ...item, status: "upcoming" } : item;
    const house = await findHouseEventForItem(persistItem);
    const previous = house
      ? house.toObject()
      : await SportsEvent.findOne(
          { provider: persistItem.provider, providerEventId: persistItem.providerEventId },
          { status: 1, scoreboard: 1 }
        ).lean();

    // Settlement owns terminal statuses: never let a provider feed reopen or
    // mutate an event that has already been settled or cancelled.
    if (previous && ["settled", "cancelled"].includes(previous.status)) {
      continue;
    }

    let event = house;
    if (house) {
      const next = {
        providerLastUpdate: new Date(),
        "metadata.oddsProviderEventId": persistItem.providerEventId,
      };
      if (persistItem.status === "live" && house.status === "upcoming") {
        next.status = "live";
      }
      if (hasScoreboard(persistItem.scoreboard)) {
        next.scoreboard = { ...(house.scoreboard || {}), ...persistItem.scoreboard };
      }
      event = await SportsEvent.findByIdAndUpdate(house._id, { $set: next }, { new: true });
    } else {
      event = await upsertEvent(persistItem);
    }

    const marketChanges = [];
    for (const market of persistItem.markets || []) {
      const marketReport = await applyMarket({
        event,
        provider: house ? house.provider : persistItem.provider,
        market,
      });

      if (marketReport.changed) {
        marketChanges.push(marketReport);
      }
    }

    if (wantsSettle) {
      const { settleEvent } = await import("./betSettlement.service.js");
      await settleEvent(event._id, {
        actor: { type: "system" },
        finalScoreboard: {
          ...(event.scoreboard || {}),
          ...(persistItem.scoreboard || {}),
          completed: true,
        },
      });
      event = await SportsEvent.findById(event._id);
    }

    const statusChanged = !previous || previous.status !== event.status;
    const scoreChanged = scoreboardChanged(previous?.scoreboard, event.scoreboard);

    if (statusChanged || scoreChanged || marketChanges.length > 0) {
      changes.push({
        eventId: event._id,
        sportKey: event.sportKey,
        sportGroup: event.sportGroup,
        status: event.status,
        startTime: event.startTime,
        statusChanged,
        previousStatus: previous?.status || null,
        scoreboardChanged: scoreChanged,
        scoreboard: event.scoreboard,
        marketChanges,
      });
    }

    ingestedEvents.push(event);
  }

  return { events: ingestedEvents, changes };
};

export const reconcileOddsApiIoLive = async (keepIds = []) => {
  const keep = keepIds.map(String).filter(Boolean);
  if (!keep.length) return 0;

  const result = await SportsEvent.updateMany(
    {
      provider: "odds-api-io",
      status: "live",
      providerEventId: { $nin: keep },
      "scoreboard.stumps": { $ne: true },
    },
    { $set: { status: "suspended" } }
  );

  return result.modifiedCount || 0;
};

export const runSportsbookIngest = async ({
  provider = "mock",
  sportKey,
  regions,
  markets,
  ioMode,
  sports,
}) => {
  let items = [];
  let resolvedKeys = sportKey ? [sportKey] : [];

  if (provider === "mock") {
    items = await fetchMockSportsbookFeed();
  } else if (provider === "simulated") {
    items = await fetchSimulatedLiveFeed();
  } else if (provider === "the-odds-api") {
    resolvedKeys = await resolveOddsSportKeys(sportKey);
    for (const key of resolvedKeys) {
      const result = await fetchTheOddsApiOdds({
        sportKey: key,
        regions,
        markets,
      });
      items = items.concat(result.items);
      await recordUsage("the-odds-api", result.usage);
    }
  } else if (provider === "odds-api-io") {
    const requested = Array.isArray(sports) && sports.length
      ? sports
      : sportKey
        ? [ioSlugForSportGroup(sportKey)].filter(Boolean)
        : [];
    const mode = ioMode || (requested.length ? "sport" : "live");
    const discoveryOnly =
      mode === "discover" || mode === "live-state" || mode === "catalog";
    const result = await fetchOddsApiIoFeed({
      includeLive: mode === "live" || mode === "live-state" || mode === "sport",
      includeUpcoming:
        mode === "discover" ||
        mode === "catalog" ||
        mode === "sport" ||
        (mode !== "live" && mode !== "live-state"),
      includeSettled: mode === "catalog" || mode === "sport",
      sports:
        mode === "live" || mode === "live-state"
          ? []
          : mode === "discover"
            ? requested.length
              ? requested
              : ["football", "tennis", "cricket"]
            : requested,
      liveSport:
        mode !== "catalog" &&
        mode !== "discover" &&
        requested.length === 1
          ? requested[0]
          : undefined,
      includePendingSports:
        mode === "live-state" || mode === "discover" ? [] : undefined,
      maxOddsEvents: discoveryOnly ? 0 : mode === "live" ? 40 : 40,
      skipTestLookup: true,
    });
    items = result.items || [];
    resolvedKeys = mode === "live" ? ["all"] : requested;
    await recordUsage("odds-api-io", result.usage);
  } else {
    throw new Error(`Unsupported sportsbook provider: ${provider}`);
  }

  const { events, changes } = await ingestNormalizedSportsbookFeed(items);

  if (provider === "odds-api-io" && ioMode === "live") {
    const dropped = await reconcileOddsApiIoLive(
      items.map((item) => item.providerEventId)
    );
    if (dropped) {
      console.log(`odds-api.io live dropped stale=${dropped}`);
    }
  }

  publishIngestChanges(changes);
  await pushSportSnapshots(
    changes.map((change) => change.sportGroup)
  );

  return {
    provider,
    sportKey: resolvedKeys.length > 1 ? "all" : resolvedKeys[0] || sportKey,
    sportKeys: resolvedKeys,
    ingestedCount: events.length,
    eventIds: events.map((event) => event._id),
    changes,
  };
};

// Match completed-score rows to stored events and settle them through the
// shared settlement service. This is the load-bearing path for real-data
// settlement: completed events drop out of the /odds feed, so only scores
// polling can finish them.
export const runScoresIngest = async ({ sportKey, daysFrom } = {}) => {
  const { items, usage } = await fetchTheOddsApiScores({ sportKey, daysFrom });
  await recordUsage("the-odds-api", usage);

  const { settleEvent } = await import("./betSettlement.service.js");

  const summary = { fetched: items.length, matched: 0, scoreboardUpdates: 0, settled: 0 };
  const changes = [];

  for (const item of items) {
    let event = await SportsEvent.findOne({
      provider: "the-odds-api",
      providerEventId: item.providerEventId,
    });

    if (!event) {
      event = await findHouseEventForItem({
        provider: "the-odds-api",
        sportKey: item.sportKey || sportKey,
        competitors: item.competitors,
      });
    }

    if (!event || ["settled", "cancelled"].includes(event.status)) {
      continue;
    }

    summary.matched += 1;

    if (item.scoreboard && scoreboardChanged(event.scoreboard, item.scoreboard)) {
      event.scoreboard = { ...(event.scoreboard || {}), ...item.scoreboard };
      event.markModified("scoreboard");
      await event.save();
      summary.scoreboardUpdates += 1;

      changes.push({
        eventId: event._id,
        sportKey: event.sportKey,
        sportGroup: event.sportGroup,
        status: event.status,
        startTime: event.startTime,
        statusChanged: false,
        previousStatus: event.status,
        scoreboardChanged: true,
        scoreboard: event.scoreboard,
        marketChanges: [],
      });
    }

    if (item.completed && item.scoreboard) {
      const result = await settleEvent(event._id, { actor: { type: "system" } });
      if (!result.skipped) {
        summary.settled += 1;
      }
    }
  }

  publishIngestChanges(changes);

  return summary;
};

export const discoverSportsbookProviderSports = async (provider) => {
  if (provider === "the-odds-api") {
    return fetchTheOddsApiSports();
  }

  return [];
};
