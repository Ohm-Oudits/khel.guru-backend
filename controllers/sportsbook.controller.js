import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import {
  getSportsbookCatalog as getSportsbookCatalogData,
} from "../services/sportsbookCatalog.service.js";
import {
  discoverSportsbookProviderSports,
  runSportsbookIngest,
} from "../services/sportsbookIngest.service.js";

const parseLimit = (value, fallback = 20) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
};

const hydrateMarketsWithLatestSnapshot = async (markets) =>
  Promise.all(
    markets.map(async (market) => {
      const latestSnapshot = await OddsSnapshot.findOne({ marketId: market._id })
        .sort({ capturedAt: -1, createdAt: -1 })
        .lean();

      return {
        ...market,
        latestSnapshot,
      };
    })
  );

export const getSportsbookCatalog = async (req, res, next) => {
  try {
    res.json(getSportsbookCatalogData());
  } catch (error) {
    next(error);
  }
};

export const getSportsbookProviders = async (req, res, next) => {
  try {
    const catalog = getSportsbookCatalogData();

    res.json({ providers: catalog.providers });
  } catch (error) {
    next(error);
  }
};

export const getSportsbookEvents = async (req, res, next) => {
  try {
    const filters = {};

    if (req.query.sportKey) {
      filters.sportKey = req.query.sportKey;
    }

    if (req.query.status) {
      filters.status = req.query.status;
    }

    if (req.query.provider) {
      filters.provider = req.query.provider;
    }

    const limit = parseLimit(req.query.limit);

    const events = await SportsEvent.find(filters)
      .sort({ startTime: 1, updatedAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      filters,
      count: events.length,
      events,
    });
  } catch (error) {
    next(error);
  }
};

export const getSportsbookEvent = async (req, res, next) => {
  try {
    const event = await SportsEvent.findById(req.params.eventId).lean();

    if (!event) {
      return res.status(404).json({ message: "Sports event not found" });
    }

    const markets = await Market.find({ eventId: event._id })
      .sort({ latestSnapshotAt: -1, title: 1 })
      .lean();

    res.json({
      event,
      markets: await hydrateMarketsWithLatestSnapshot(markets),
    });
  } catch (error) {
    next(error);
  }
};

export const getSportsbookEventMarkets = async (req, res, next) => {
  try {
    const event = await SportsEvent.findById(req.params.eventId).lean();

    if (!event) {
      return res.status(404).json({ message: "Sports event not found" });
    }

    const markets = await Market.find({ eventId: event._id })
      .sort({ latestSnapshotAt: -1, title: 1 })
      .lean();

    res.json({
      event,
      count: markets.length,
      markets: await hydrateMarketsWithLatestSnapshot(markets),
    });
  } catch (error) {
    next(error);
  }
};

export const ingestSportsbookFeed = async (req, res, next) => {
  try {
    const provider =
      req.body.provider || process.env.SPORTSBOOK_DEFAULT_PROVIDER || "mock";

    const result = await runSportsbookIngest({
      provider,
      sportKey: req.body.sportKey,
      regions: req.body.regions,
      markets: req.body.markets,
    });

    res.status(201).json({
      message: "Sportsbook feed ingested successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getProviderSportsCatalog = async (req, res, next) => {
  try {
    const sports = await discoverSportsbookProviderSports(req.params.provider);

    res.json({
      provider: req.params.provider,
      sports,
    });
  } catch (error) {
    next(error);
  }
};
