import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import {
  buildSportsbookCatalog,
  getSportsbookCatalog as getSportsbookCatalogData,
} from "../services/sportsbookCatalog.service.js";
import {
  isSportsbookIoOnly,
  listHydratedSportsEvents,
  sportsEventListFilter,
} from "../services/sportsbookEvents.service.js";
import { fetchTheOddsApiSports } from "../services/sportsbookProviders/theOddsApiProvider.js";
import { fetchOddsApiIoParticipantLogo } from "../services/sportsbookProviders/oddsApiIoProvider.js";
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

  return Math.min(parsed, 250);
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
    let providerSports = [];

    if (process.env.THE_ODDS_API_KEY && !isSportsbookIoOnly()) {
      try {
        providerSports = await fetchTheOddsApiSports();
      } catch {
        providerSports = [];
      }
    }

    const eventRows = await SportsEvent.aggregate([
      {
        $match: {
          status: { $in: ["live", "upcoming"] },
          ...(isSportsbookIoOnly() ? { provider: "odds-api-io" } : {}),
        },
      },
      {
        $group: {
          _id: {
            sportGroup: "$sportGroup",
            sportKey: "$sportKey",
            leagueName: "$leagueName",
            sportName: "$sportName",
          },
          liveCount: {
            $sum: { $cond: [{ $eq: ["$status", "live"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          sportGroup: "$_id.sportGroup",
          sportKey: "$_id.sportKey",
          leagueName: "$_id.leagueName",
          sportName: "$_id.sportName",
          liveCount: 1,
        },
      },
    ]);

    res.json(buildSportsbookCatalog({ providerSports, eventRows }));
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
    const sameDay =
      req.query.sameDay === "1" || req.query.sameDay === "true";
    const filters = sportsEventListFilter({
      sportKey: req.query.sportKey,
      status: req.query.status,
      provider: req.query.provider,
      sameDay,
    });

    const limit = parseLimit(req.query.limit);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");

    if (req.query.hydrate) {
      const events = await listHydratedSportsEvents({
        sportKey: req.query.sportKey,
        status: req.query.status,
        provider: req.query.provider,
        sameDay,
        limit,
      });

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
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
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
      sportKeys: result.sportKeys,
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

export const getParticipantLogo = async (req, res, next) => {
  try {
    const participantId = String(req.params.participantId || "").replace(
      /\D/g,
      ""
    );
    if (!participantId) {
      return res.status(400).json({ message: "Invalid participant" });
    }

    const result = await fetchOddsApiIoParticipantLogo(participantId);
    if (!result?.buffer) {
      return res.status(404).end();
    }

    res.set("Content-Type", result.contentType || "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(result.buffer);
  } catch (error) {
    if (/ODDS_API_IO_KEY is not configured/i.test(error.message || "")) {
      return res.status(404).end();
    }
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
