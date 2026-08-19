import axios from "axios";

const THE_ODDS_API_BASE_URL =
  process.env.THE_ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4";

const MARKET_TITLE_MAP = {
  h2h: "Match Winner",
  spreads: "Point Spread",
  totals: "Totals",
  outrights: "Outright Winner",
};

const normalizeSelectionKey = (name, line = null) =>
  `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_")}${line !== null ? `_${line}` : ""}`;

const normalizeEventStatus = (commenceTime) => {
  const start = new Date(commenceTime).getTime();
  if (Number.isNaN(start)) return "upcoming";
  return start <= Date.now() ? "live" : "upcoming";
};

export const mapTheOddsApiOddsResponse = (events, sportKey) =>
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
          region: "",
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
  regions = "uk,eu",
  markets = "h2h,spreads,totals",
  oddsFormat = "decimal",
}) => {
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    throw new Error("THE_ODDS_API_KEY is not configured");
  }

  const response = await axios.get(
    `${THE_ODDS_API_BASE_URL}/sports/${sportKey}/odds`,
    {
      params: {
        apiKey,
        regions,
        markets,
        oddsFormat,
        dateFormat: "iso",
      },
    }
  );

  return mapTheOddsApiOddsResponse(response.data, sportKey);
};
