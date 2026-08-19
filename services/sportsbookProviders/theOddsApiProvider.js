import axios from "axios";

const THE_ODDS_API_BASE_URL =
  process.env.THE_ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4";

const MARKET_TITLE_MAP = {
  h2h: "Match Winner",
  spreads: "Point Spread",
  totals: "Totals",
  outrights: "Outright Winner",
};

export const normalizeSelectionKey = (name, line = null) =>
  `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_")}${line !== null ? `_${line}` : ""}`;

const toNumberOrNull = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readUsageHeaders = (headers = {}) => ({
  used: toNumberOrNull(headers["x-requests-used"]),
  remaining: toNumberOrNull(headers["x-requests-remaining"]),
  cost: toNumberOrNull(headers["x-requests-last"]),
});

const normalizeEventStatus = (commenceTime) => {
  const start = new Date(commenceTime).getTime();
  if (Number.isNaN(start)) return "upcoming";
  return start <= Date.now() ? "live" : "upcoming";
};

export const mapTheOddsApiOddsResponse = (events, sportKey, regions = "") =>
  events.map((event) => {
    const marketMap = new Map();

    for (const bookmaker of event.bookmakers || []) {
      for (const market of bookmaker.markets || []) {
        const existing = marketMap.get(market.key) || {
          providerMarketKey: market.key,
          marketType: ["h2h", "spreads", "totals", "outrights"].includes(
            market.key
          )
            ? market.key
            : "other",
          title: MARKET_TITLE_MAP[market.key] || market.key,
          selections: [],
          snapshots: [],
        };

        const outcomes = (market.outcomes || []).map((outcome) => ({
          key: normalizeSelectionKey(outcome.name, outcome.point ?? null),
          name: outcome.name,
          line: outcome.point ?? null,
          priceDecimal: Number(outcome.price),
        }));

        const selectionMap = new Map(
          existing.selections.map((selection) => [selection.key, selection])
        );

        for (const outcome of outcomes) {
          if (!selectionMap.has(outcome.key)) {
            selectionMap.set(outcome.key, {
              key: outcome.key,
              name: outcome.name,
              line: outcome.line,
            });
          }
        }

        existing.selections = Array.from(selectionMap.values());
        existing.snapshots.push({
          bookmakerKey: bookmaker.key,
          bookmakerTitle: bookmaker.title,
          // The Odds API does not attribute a region per bookmaker, so stamp
          // the requested regions string on every snapshot.
          region: regions || "",
          capturedAt: new Date().toISOString(),
          providerLastUpdate: bookmaker.last_update || null,
          outcomes,
        });

        marketMap.set(market.key, existing);
      }
    }

    return {
      provider: "the-odds-api",
      providerEventId: event.id,
      sportKey,
      sportName: event.sport_title || sportKey,
      leagueName: event.sport_title || sportKey,
      status: normalizeEventStatus(event.commence_time),
      startTime: event.commence_time,
      competitors: [
        { name: event.home_team, role: "home" },
        { name: event.away_team, role: "away" },
      ],
      rawPayload: event,
      markets: Array.from(marketMap.values()),
    };
  });

// Scores rows resolve home/away by matching score names against the event's
// own home_team/away_team fields — same API, names are consistent.
export const mapTheOddsApiScoresResponse = (games = []) =>
  games.map((game) => {
    let scoreboard = null;

    if (Array.isArray(game.scores)) {
      const scoreFor = (team) => {
        const row = game.scores.find((entry) => entry.name === team);
        const value = row ? Number(row.score) : NaN;
        return Number.isFinite(value) ? value : null;
      };

      const home = scoreFor(game.home_team);
      const away = scoreFor(game.away_team);

      if (home !== null && away !== null) {
        scoreboard = { home, away, completed: Boolean(game.completed) };
      }
    }

    return {
      providerEventId: game.id,
      completed: Boolean(game.completed),
      scoreboard,
      lastUpdate: game.last_update || null,
    };
  });

export const fetchTheOddsApiScores = async ({ sportKey, daysFrom } = {}) => {
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    throw new Error("THE_ODDS_API_KEY is not configured");
  }

  const response = await axios.get(
    `${THE_ODDS_API_BASE_URL}/sports/${sportKey}/scores`,
    {
      params: {
        apiKey,
        dateFormat: "iso",
        ...(daysFrom ? { daysFrom } : {}),
      },
    }
  );

  return {
    items: mapTheOddsApiScoresResponse(response.data),
    usage: readUsageHeaders(response.headers),
  };
};

export const fetchTheOddsApiSports = async () => {
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    throw new Error("THE_ODDS_API_KEY is not configured");
  }

  const response = await axios.get(`${THE_ODDS_API_BASE_URL}/sports`, {
    params: {
      apiKey,
    },
  });

  return response.data;
};

export const fetchTheOddsApiOdds = async ({
  sportKey,
  regions,
  markets,
  oddsFormat = "decimal",
}) => {
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    throw new Error("THE_ODDS_API_KEY is not configured");
  }

  const requestedRegions = regions || process.env.THE_ODDS_API_REGIONS || "uk";
  const requestedMarkets = markets || process.env.THE_ODDS_API_MARKETS || "h2h,totals";

  const response = await axios.get(
    `${THE_ODDS_API_BASE_URL}/sports/${sportKey}/odds`,
    {
      params: {
        apiKey,
        regions: requestedRegions,
        markets: requestedMarkets,
        oddsFormat,
        dateFormat: "iso",
      },
    }
  );

  return {
    items: mapTheOddsApiOddsResponse(response.data, sportKey, requestedRegions),
    usage: readUsageHeaders(response.headers),
  };
};
