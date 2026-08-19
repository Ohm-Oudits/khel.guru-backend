import crypto from "crypto";

import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import { publishIngestChanges } from "../socket/modules/sports/sports.emitter.js";
import { recordUsage } from "./providerUsage.service.js";
import { resolveSportGroup } from "./sportsbookCatalog.service.js";
import {
  fetchMockSportsbookFeed,
} from "./sportsbookProviders/mockSportsbookProvider.js";
import {
  fetchSimulatedLiveFeed,
} from "./sportsbookProviders/simulatedLiveProvider.js";
import {
  fetchTheOddsApiOdds,
  fetchTheOddsApiSports,
} from "./sportsbookProviders/theOddsApiProvider.js";

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

const upsertEvent = async (item) =>
  SportsEvent.findOneAndUpdate(
    {
      provider: item.provider,
      providerEventId: item.providerEventId,
    },
    {
      $set: {
        sportKey: item.sportKey,
        sportGroup: resolveSportGroup(item.sportKey),
        sportName: item.sportName,
        leagueName: item.leagueName,
        countryCode: item.countryCode || "",
        status: item.status,
        startTime: normalizeDate(item.startTime),
        competitors: item.competitors || [],
        scoreboard: item.scoreboard || {},
        providerLastUpdate: item.providerLastUpdate
          ? normalizeDate(item.providerLastUpdate)
          : null,
        metadata: item.metadata || {},
        rawPayload: item.rawPayload || {},
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

// Denormalize a current price per selection key: the primary bookmaker when
// configured and present, otherwise the best available price across books.
const denormalizeSelectionPrices = ({ selections, latestOdds, now }) => {
  const primaryKey = process.env.SPORTSBOOK_PRIMARY_BOOKMAKER || null;
  const primaryBook =
    primaryKey && latestOdds.find((entry) => entry.bookmakerKey === primaryKey);

  const priceByKey = new Map();

  const books = primaryBook ? [primaryBook] : latestOdds;
  for (const book of books) {
    for (const outcome of book.outcomes || []) {
      const existing = priceByKey.get(outcome.key);
      if (existing === undefined || outcome.priceDecimal > existing) {
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
    selections = denormalizeSelectionPrices({ selections, latestOdds, now });
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
    const previous = await SportsEvent.findOne(
      { provider: item.provider, providerEventId: item.providerEventId },
      { status: 1, scoreboard: 1 }
    ).lean();

    // Settlement owns terminal statuses: never let a provider feed reopen or
    // mutate an event that has already been settled or cancelled.
    if (previous && ["settled", "cancelled"].includes(previous.status)) {
      continue;
    }

    const event = await upsertEvent(item);

    const marketChanges = [];
    for (const market of item.markets || []) {
      const marketReport = await applyMarket({
        event,
        provider: item.provider,
        market,
      });

      if (marketReport.changed) {
        marketChanges.push(marketReport);
      }
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

export const runSportsbookIngest = async ({
  provider = "mock",
  sportKey = "cricket",
  regions,
  markets,
}) => {
  let items = [];

  if (provider === "mock") {
    items = await fetchMockSportsbookFeed();
  } else if (provider === "simulated") {
    items = await fetchSimulatedLiveFeed();
  } else if (provider === "the-odds-api") {
    const result = await fetchTheOddsApiOdds({ sportKey, regions, markets });
    items = result.items;
    await recordUsage("the-odds-api", result.usage);
  } else {
    throw new Error(`Unsupported sportsbook provider: ${provider}`);
  }

  const { events, changes } = await ingestNormalizedSportsbookFeed(items);

  publishIngestChanges(changes);

  return {
    provider,
    sportKey,
    ingestedCount: events.length,
    eventIds: events.map((event) => event._id),
    changes,
  };
};

export const discoverSportsbookProviderSports = async (provider) => {
  if (provider === "the-odds-api") {
    return fetchTheOddsApiSports();
  }

  return [];
};
