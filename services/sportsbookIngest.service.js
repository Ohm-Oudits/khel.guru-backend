import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import {
  fetchMockSportsbookFeed,
} from "./sportsbookProviders/mockSportsbookProvider.js";
import {
  fetchTheOddsApiOdds,
  fetchTheOddsApiSports,
} from "./sportsbookProviders/theOddsApiProvider.js";

const normalizeDate = (value) => (value ? new Date(value) : new Date());

const upsertEvent = async (item) =>
  SportsEvent.findOneAndUpdate(
    {
      provider: item.provider,
      providerEventId: item.providerEventId,
    },
    {
      $set: {
        sportKey: item.sportKey,
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

const upsertMarket = async ({ eventId, provider, market }) =>
  Market.findOneAndUpdate(
    {
      eventId,
      provider,
      providerMarketKey: market.providerMarketKey,
    },
    {
      $set: {
        marketType: market.marketType || "other",
        title: market.title,
        status: market.status || "open",
        selections: market.selections || [],
        bookmakerCount: (market.snapshots || []).length,
        latestSnapshotAt:
          market.snapshots?.[market.snapshots.length - 1]?.capturedAt || null,
        metadata: market.metadata || {},
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

const upsertSnapshots = async ({ eventId, marketId, provider, market }) => {
  const snapshots = market.snapshots || [];

  for (const snapshot of snapshots) {
    await OddsSnapshot.findOneAndUpdate(
      {
        eventId,
        marketId,
        bookmakerKey: snapshot.bookmakerKey,
        capturedAt: normalizeDate(snapshot.capturedAt),
      },
      {
        $set: {
          provider,
          bookmakerTitle: snapshot.bookmakerTitle,
          region: snapshot.region || "",
          providerLastUpdate: snapshot.providerLastUpdate
            ? normalizeDate(snapshot.providerLastUpdate)
            : null,
          outcomes: snapshot.outcomes || [],
          metadata: snapshot.metadata || {},
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
};

export const ingestNormalizedSportsbookFeed = async (items) => {
  const ingestedEvents = [];

  for (const item of items) {
    const event = await upsertEvent(item);

    for (const market of item.markets || []) {
      const marketDocument = await upsertMarket({
        eventId: event._id,
        provider: item.provider,
        market,
      });

      await upsertSnapshots({
        eventId: event._id,
        marketId: marketDocument._id,
        provider: item.provider,
        market,
      });
    }

    ingestedEvents.push(event);
  }

  return ingestedEvents;
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
  } else if (provider === "the-odds-api") {
    items = await fetchTheOddsApiOdds({ sportKey, regions, markets });
  } else {
    throw new Error(`Unsupported sportsbook provider: ${provider}`);
  }

  const events = await ingestNormalizedSportsbookFeed(items);

  return {
    provider,
    sportKey,
    ingestedCount: events.length,
    eventIds: events.map((event) => event._id),
  };
};

export const discoverSportsbookProviderSports = async (provider) => {
  if (provider === "the-odds-api") {
    return fetchTheOddsApiSports();
  }

  return [];
};
