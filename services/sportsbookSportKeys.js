import { fetchTheOddsApiSports } from "./sportsbookProviders/theOddsApiProvider.js";
import { SPORTSBOOK_CATALOG } from "./sportsbookCatalog.service.js";

const ALL_TOKENS = new Set(["all", "*", "in-season"]);

export const parseSportKeyList = (value, fallback = "all") =>
  String(value ?? fallback)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const configuredSportKeyList = () =>
  parseSportKeyList(process.env.SPORTSBOOK_LIVE_SPORT_KEYS, "all");

export const isAllSportsToken = (value) =>
  ALL_TOKENS.has(String(value || "").toLowerCase().trim());

const configuredMarkets = () =>
  String(process.env.THE_ODDS_API_MARKETS || "h2h,totals")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const listInSeasonOddsSportKeys = async () => {
  const sports = await fetchTheOddsApiSports();
  const markets = configuredMarkets();
  const includeOutrights = markets.includes("outrights");

  return (sports || [])
    .filter((sport) => sport && sport.active !== false && sport.key)
    .filter((sport) => includeOutrights || sport.has_outrights !== true)
    .map((sport) => sport.key);
};

// Catalog boot/seed should not spend credits on every in-season soccer
// league. Match only the house providerHints (exact or hint_ prefix).
export const matchCatalogHintKeys = (
  hints = [],
  inSeasonKeys = [],
  { maxPerHint = 2 } = {}
) => {
  const inSeason = (inSeasonKeys || []).filter(Boolean);
  const seen = new Set();
  const matched = [];

  for (const hint of (hints || []).filter(Boolean)) {
    const hits = inSeason.filter(
      (key) => key === hint || key.startsWith(`${hint}_`)
    );
    for (const key of hits.slice(0, maxPerHint)) {
      if (seen.has(key)) continue;
      seen.add(key);
      matched.push(key);
    }
  }

  return matched;
};

export const resolveOddsSportKeys = async (requestedKey) => {
  const requested = String(requestedKey || "").trim();
  const configured = configuredSportKeyList();
  const wantsAll =
    !requested ||
    isAllSportsToken(requested) ||
    (configured.length === 1 && isAllSportsToken(configured[0]));

  if (requested && !isAllSportsToken(requested) && requested.includes("_")) {
    return [requested];
  }

  const inSeason = wantsAll || requested ? await listInSeasonOddsSportKeys() : [];

  if (requested && !isAllSportsToken(requested) && !requested.includes("_")) {
    const catalog = SPORTSBOOK_CATALOG.find(
      (sport) => sport.sportKey === requested
    );
    const hints = new Set(catalog?.providerHints || []);
    return inSeason.filter(
      (key) =>
        hints.has(key) ||
        key === requested ||
        key.startsWith(`${requested}_`) ||
        (requested === "football" && key.startsWith("soccer_")) ||
        (requested === "icehockey" && key.startsWith("icehockey_")) ||
        (requested === "americanfootball" &&
          key.startsWith("americanfootball_"))
    );
  }

  if (configured.length && !configured.every(isAllSportsToken)) {
    return configured;
  }

  return inSeason;
};
