import SportsEvent from "../models/sportsEvent.model.js";
import { sportGroupEventFilter } from "./sportsbookCatalog.service.js";

const TEAM_ALIASES = {
  ban: "bangladesh",
  aus: "australia",
  ind: "india",
  eng: "england",
  pak: "pakistan",
  sl: "srilanka",
  nz: "newzealand",
  sa: "southafrica",
  wi: "westindies",
  afg: "afghanistan",
  vic: "victoria",
  vicca: "victoria",
  victoriaca: "victoria",
  victoriacaxi: "victoria",
  hyk: "hyderabadkingsmenacademy",
  hhka: "hyderabadkingsmenacademy",
  kingsmen: "hyderabadkingsmenacademy",
  hyderabadkingsmen: "hyderabadkingsmenacademy",
  hyderabadkingsmenacademy: "hyderabadkingsmenacademy",
  nsw: "newsouthwales",
  mi: "mumbaiindians",
  csk: "chennaisuperkings",
};

export const normalizeTeamName = (value = "") => {
  const compact = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return TEAM_ALIASES[compact] || compact;
};

export const eventPairKey = (event = {}) => {
  const names = (event.competitors || [])
    .map((team) => normalizeTeamName(team.shortName || team.name))
    .filter(Boolean)
    .sort();
  const group = event.sportGroup || event.sportKey || "";
  return names.length ? `${group}:${names.join("|")}` : "";
};

const richness = (event = {}) => {
  let score = 0;
  if (event.provider === "mock") score += 5;
  if (event.status === "live") score += 3;
  if (event.scoreboard?.home != null || event.scoreboard?.away != null) {
    score += 3;
  }
  if (event.scoreboard?.venue || event.scoreboard?.note) score += 1;
  score += Math.min((event.markets || []).length, 3);
  return score;
};

export const dedupeSportsEvents = (events = []) => {
  const chosen = new Map();

  for (const event of events) {
    const key = eventPairKey(event) || String(event._id || event.providerEventId);
    const existing = chosen.get(key);
    if (!existing || richness(event) > richness(existing)) {
      chosen.set(key, event);
    }
  }

  return Array.from(chosen.values()).sort(
    (left, right) =>
      new Date(left.startTime || 0).getTime() -
      new Date(right.startTime || 0).getTime()
  );
};

export const isSportsbookIoOnly = () =>
  process.env.SPORTSBOOK_IO_ONLY === "true" ||
  process.env.SPORTSBOOK_DEFAULT_PROVIDER === "odds-api-io";

export const normalizeEventStatusQuery = (status) =>
  status === "completed" ? "settled" : status;

export const sportsEventListFilter = ({
  sportKey,
  status,
  provider,
  sameDay,
} = {}) => {
  const clauses = [];

  if (sportKey) {
    clauses.push(sportGroupEventFilter(sportKey));
  }
  if (provider) {
    clauses.push({ provider });
  } else if (isSportsbookIoOnly()) {
    clauses.push({ provider: "odds-api-io" });
  }

  const normalized = normalizeEventStatusQuery(status);
  if (normalized) {
    clauses.push({ status: normalized });
  }

  // House cricket boards stay for live scores only when io-only is off.
  if (normalized === "upcoming" && !provider && !isSportsbookIoOnly()) {
    clauses.push({ provider: { $nin: ["mock", "simulated"] } });
  }

  if (sameDay && normalized === "settled") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    clauses.push({
      $or: [
        { "metadata.settledAt": { $gte: since.toISOString() } },
        { updatedAt: { $gte: since } },
        { startTime: { $gte: since } },
      ],
    });
  }

  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
};

export const listHydratedSportsEvents = async ({
  sportKey,
  status,
  provider,
  sameDay,
  limit = 100,
} = {}) => {
  const filters = sportsEventListFilter({
    sportKey,
    status,
    provider,
    sameDay,
  });

  const events = await SportsEvent.aggregate([
    { $match: filters },
    { $sort: { startTime: 1 } },
    { $limit: Math.min(Number(limit) || 100, 250) },
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

  return dedupeSportsEvents(events);
};
