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
import { getUsage } from "../services/providerUsage.service.js";
import { getSchedulerStatus } from "../services/sportsbookScheduler.service.js";

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
      // A canonical group like "cricket" matches provider keys such as
      // cricket_ipl through sportGroup; exact provider keys still work.
      filters.$or = [
        { sportKey: req.query.sportKey },
        { sportGroup: req.query.sportKey },
      ];
    }

    if (req.query.status) {
      filters.status = req.query.status;
    }

    if (req.query.provider) {
      filters.provider = req.query.provider;
    }

    const limit = parseLimit(req.query.limit);

    if (req.query.hydrate) {
      const events = await SportsEvent.aggregate([
        { $match: filters },
        { $sort: { startTime: 1 } },
        { $limit: limit },
        {
          $lookup: {
            from: "markets",
            localField: "_id",
            foreignField: "eventId",
            as: "markets",
            pipeline: [
              {
                $project: {
                  title: 1,
                  marketType: 1,
                  providerMarketKey: 1,
                  status: 1,
                  selections: 1,
                  latestSnapshotAt: 1,
                  latestOdds: { $slice: ["$latestOdds", 3] },
                },
              },
            ],
          },
        },
        {
          $project: {
            rawPayload: 0,
            "markets.latestOdds.signature": 0,
          },
        },
      ]);

      return res.json({
        filters,
        count: events.length,
        events,
      });
    }

    const events = await SportsEvent.find(filters)
      .sort({ startTime: 1, updatedAt: -1 })
      .limit(limit)
      .select("-rawPayload")
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
      provider: result.provider,
      sportKey: result.sportKey,
      ingestedCount: result.ingestedCount,
      eventIds: result.eventIds,
      changedEventCount: result.changes.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getSportsbookUsage = async (req, res, next) => {
  try {
    const usage = await getUsage("the-odds-api");

    res.json({
      usage,
      budget: {
        monthly: Number(process.env.THE_ODDS_API_MONTHLY_BUDGET || 500),
        reserve: Number(process.env.THE_ODDS_API_RESERVE_CREDITS || 50),
      },
      scheduler: getSchedulerStatus(),
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
