import axios from "axios";

import {
  canonicalizeSportGroup,
  ODDS_API_IO_SPORT_SLUGS,
} from "../sportsbookCatalog.service.js";
import { normalizeSelectionKey } from "./theOddsApiProvider.js";

const ODDS_API_IO_BASE_URL =
  process.env.ODDS_API_IO_BASE_URL || "https://api.odds-api.io/v3";

const DEFAULT_BOOKMAKERS = "1xbet,Polymarket";

export const oddsApiIoUpdatedSportName = (slug = "football") =>
  String(slug)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Football";

const PLACEHOLDER_TEAM = /^(a\d+|b\d+|qf\s)/i;

const slugBookmaker = (name = "") =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const toNumberOrNull = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readUsageHeaders = (headers = {}) => ({
  remaining: toNumberOrNull(
    headers["x-ratelimit-remaining"] || headers["x-requests-remaining"]
  ),
  limit: toNumberOrNull(
    headers["x-ratelimit-limit"] || headers["x-requests-limit"]
  ),
  cost: 1,
});

export const sportKeyFromOddsApiIoLeague = (league = "") => {
  const text = String(league);
  if (/\btest\b/i.test(text)) return "cricket_test_match";
  if (/\b(odi|one-day|one day|list a)\b/i.test(text)) return "cricket_odi";
  return "cricket_t20";
};

const slugify = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export const sportKeyFromOddsApiIoEvent = (event = {}) => {
  const group = canonicalizeSportGroup(event.sport?.slug || "");
  const leagueName = event.league?.name || event.league || "";
  if (group === "cricket") return sportKeyFromOddsApiIoLeague(leagueName);
  const leagueKey = slugify(event.league?.slug || leagueName);
  if (group && leagueKey) return `${group}_${leagueKey}`;
  return group || "unknown";
};

export const mapOddsApiIoStatus = (status = "", date, now = Date.now()) => {
  const value = String(status).toLowerCase();
  if (value === "live") return "live";
  if (value === "settled") return "settled";
  if (value === "cancelled") return "cancelled";
  const start = new Date(date || "").getTime();
  if (value === "pending" && Number.isFinite(start) && start <= now) {
    return "live";
  }
  return "upcoming";
};

export const isOddsApiIoTestMatch = (event = {}) =>
  /\btest\b/i.test(String(event.league?.name || event.league || ""));

export const isOddsApiIoStumps = (event = {}) => {
  if (!isOddsApiIoTestMatch(event)) return false;
  const detail = [
    event.clock?.statusDetail,
    event.statusDetail,
    event.scores?.note,
    event.scores?.session,
    event.scores?.status,
  ]
    .filter(Boolean)
    .join(" ");
  if (/stumps/i.test(detail)) return true;
  if (/finished|ended|complete|result/i.test(detail)) return false;
  if (event.scores?.winner || event.winner) return false;
  return String(event.status).toLowerCase() === "settled";
};

const isPlaceholderEvent = (event = {}) =>
  PLACEHOLDER_TEAM.test(String(event.home || "").trim()) ||
  PLACEHOLDER_TEAM.test(String(event.away || "").trim());

const usableClockDetail = (value) => {
  const text = String(value || "").trim();
  if (!text || /^(null|undefined|none|n\/a|-)$/i.test(text)) return undefined;
  return text;
};

const mapScoreboard = (event = {}, leagueName = "", { stumps = false, completed = false } = {}) => {
  const scores = event.scores || {};
  const clock = event.clock || null;
  return {
    title: leagueName,
    home: toNumberOrNull(scores.home),
    away: toNumberOrNull(scores.away),
    periods: scores.periods || undefined,
    session: stumps ? "Stumps" : usableClockDetail(clock?.statusDetail),
    note: stumps ? "Stumps" : scores.note || undefined,
    clock: clock || undefined,
    stumps,
    completed,
  };
};

export const isOddsApiIoCompletedWithinHours = (
  event = {},
  hours = 24,
  now = Date.now()
) => {
  const start = new Date(event.date || event.startTime).getTime();
  if (Number.isNaN(start)) return false;
  return now - start <= hours * 60 * 60 * 1000;
};

export const mapOddsApiIoEvent = (event = {}, now = Date.now()) => {
  if (!event?.id || !event.home || !event.away) return null;
  if (isPlaceholderEvent(event)) return null;

  const stumps = isOddsApiIoStumps(event);
  let status = mapOddsApiIoStatus(event.status, event.date, now);
  if (stumps) status = "live";
  if (status === "cancelled") return null;
  const completed = status === "settled" && !stumps;
  if (completed && !isOddsApiIoCompletedWithinHours(event, 24, now)) {
    return null;
  }

  const leagueName =
    event.league?.name || event.league || event.sport?.name || "Sports";

  return {
    provider: "odds-api-io",
    providerEventId: String(event.id),
    sportKey: sportKeyFromOddsApiIoEvent(event),
    sportName: event.sport?.name || "Sports",
    leagueName,
    status,
    completed,
    startTime: event.date,
    competitors: [
      { name: event.home, role: "home" },
      { name: event.away, role: "away" },
    ],
    scoreboard: mapScoreboard(event, leagueName, { stumps, completed }),
    metadata: {
      ...(event.homeId ? { homeId: event.homeId } : {}),
      ...(event.awayId ? { awayId: event.awayId } : {}),
    },
    markets: [],
  };
};

const mlOutcomes = (event, odds = {}) => {
  const outcomes = [];
  const home = toNumberOrNull(odds.home);
  const away = toNumberOrNull(odds.away);
  const draw = toNumberOrNull(odds.draw);
  if (home != null) {
    outcomes.push({
      key: normalizeSelectionKey(event.home),
      name: event.home,
      priceDecimal: home,
    });
  }
  if (draw != null) {
    outcomes.push({
      key: "draw",
      name: "Draw",
      priceDecimal: draw,
    });
  }
  if (away != null) {
    outcomes.push({
      key: normalizeSelectionKey(event.away),
      name: event.away,
      priceDecimal: away,
    });
  }
  return outcomes;
};

export const applyOddsApiIoBookmakers = (item, oddsPayload = {}) => {
  if (!item) return null;
  const books = oddsPayload.bookmakers || {};
  const market = {
    providerMarketKey: "h2h",
    marketType: "h2h",
    title: String(item.sportKey || "").startsWith("football")
      ? "Match Result"
      : "Match Winner",
    selections: [],
    snapshots: [],
  };
  const selectionMap = new Map();
  const marketCount = Math.max(
    0,
    ...Object.values(books).map((markets) =>
      Array.isArray(markets) ? markets.length : 0
    )
  );

  for (const [bookmakerTitle, markets] of Object.entries(books)) {
    const ml = (markets || []).find((entry) => entry.name === "ML");
    const home = item.competitors.find((team) => team.role === "home")?.name;
    const away = item.competitors.find((team) => team.role === "away")?.name;
    const outcomes = mlOutcomes(
      { home, away },
      ml?.odds?.[0] || {}
    );
    if (!outcomes.length) continue;

    for (const outcome of outcomes) {
      if (!selectionMap.has(outcome.key)) {
        selectionMap.set(outcome.key, {
          key: outcome.key,
          name: outcome.name,
          line: null,
        });
      }
    }

    market.snapshots.push({
      bookmakerKey: slugBookmaker(bookmakerTitle),
      bookmakerTitle,
      region: "",
      capturedAt: ml?.updatedAt || new Date().toISOString(),
      outcomes,
    });
  }

  market.selections = Array.from(selectionMap.values());
  return {
    ...item,
    metadata: {
      ...(item.metadata || {}),
      ...(marketCount ? { marketCount } : {}),
      bookmakerCount: Object.keys(books).length,
    },
    markets: market.snapshots.length ? [market] : [],
  };
};

const configuredBookmakers = () =>
  process.env.ODDS_API_IO_BOOKMAKERS || DEFAULT_BOOKMAKERS;

const requireKey = () => {
  const apiKey = process.env.ODDS_API_IO_KEY;
  if (!apiKey) {
    throw new Error("ODDS_API_IO_KEY is not configured");
  }
  return apiKey;
};

export const fetchOddsApiIoEvents = async ({
  sport = "cricket",
  status,
  from,
  to,
  limit = 80,
} = {}) => {
  const apiKey = requireKey();
  const response = await axios.get(`${ODDS_API_IO_BASE_URL}/events`, {
    params: {
      apiKey,
      sport,
      limit,
      ...(status ? { status } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
  });

  return {
    events: Array.isArray(response.data) ? response.data : [],
    usage: readUsageHeaders(response.headers),
  };
};

export const fetchOddsApiIoEventById = async (eventId) => {
  const apiKey = requireKey();
  const response = await axios.get(`${ODDS_API_IO_BASE_URL}/events/${eventId}`, {
    params: { apiKey },
  });
  return {
    event: response.data || null,
    usage: readUsageHeaders(response.headers),
  };
};

const enrichSettledTests = async (events = []) => {
  const next = [];
  let usage = { cost: 0 };
  for (const event of events) {
    if (
      String(event.status).toLowerCase() === "settled" &&
      isOddsApiIoTestMatch(event)
    ) {
      try {
        const detail = await fetchOddsApiIoEventById(event.id);
        usage = detail.usage || usage;
        next.push({ ...event, ...(detail.event || {}) });
        continue;
      } catch {
        next.push(event);
        continue;
      }
    }
    next.push(event);
  }
  return { events: next, usage };
};

export const fetchOddsApiIoLiveEvents = async ({ sport } = {}) => {
  const apiKey = requireKey();
  const response = await axios.get(`${ODDS_API_IO_BASE_URL}/events/live`, {
    params: {
      apiKey,
      ...(sport ? { sport } : {}),
    },
    validateStatus: (status) => status === 200 || status === 403 || status === 404,
  });

  return {
    events: Array.isArray(response.data) ? response.data : [],
    usage: readUsageHeaders(response.headers),
  };
};

export const fetchOddsApiIoOdds = async ({ eventId, bookmakers } = {}) => {
  const apiKey = requireKey();
  const response = await axios.get(`${ODDS_API_IO_BASE_URL}/odds`, {
    params: {
      apiKey,
      eventId,
      bookmakers: bookmakers || configuredBookmakers(),
    },
    validateStatus: (status) =>
      status === 200 || status === 403 || status === 404,
  });
  if (response.status !== 200) {
    return { odds: {}, usage: readUsageHeaders(response.headers) };
  }

  return {
    odds: response.data || {},
    usage: readUsageHeaders(response.headers),
  };
};

export const fetchOddsApiIoUpdatedOdds = async ({
  since,
  bookmaker,
  sport = "cricket",
} = {}) => {
  const apiKey = requireKey();
  const book = bookmaker || configuredBookmakers().split(",")[0] || "1xbet";
  const sinceUnix = Number.isFinite(Number(since))
    ? Number(since)
    : Math.floor(Date.now() / 1000) - 80;
  const response = await axios.get(`${ODDS_API_IO_BASE_URL}/odds/updated`, {
    params: {
      apiKey,
      since: sinceUnix,
      bookmaker: book,
      sport,
    },
    validateStatus: (status) =>
      status === 200 || status === 400 || status === 404,
  });

  return {
    odds: Array.isArray(response.data) ? response.data : [],
    usage: readUsageHeaders(response.headers),
  };
};

export const applyOddsApiIoUpdatedPayload = (item, payload = {}) => {
  let next = item;
  if (payload.scores || payload.clock || payload.status) {
    const mapped = mapOddsApiIoEvent({
      id: payload.id || item.providerEventId,
      home: payload.home || item.competitors?.[0]?.name,
      away: payload.away || item.competitors?.[1]?.name,
      date: payload.date || item.startTime,
      status: payload.status || (item.status === "live" ? "live" : item.status),
      sport: payload.sport || { name: item.sportName, slug: "cricket" },
      league: payload.league || { name: item.leagueName },
      scores: payload.scores || {
        home: item.scoreboard?.home,
        away: item.scoreboard?.away,
        periods: item.scoreboard?.periods,
      },
      clock: payload.clock || item.scoreboard?.clock,
    });
    if (mapped) {
      next = {
        ...item,
        status: mapped.status,
        completed: mapped.completed,
        scoreboard: { ...(item.scoreboard || {}), ...mapped.scoreboard },
      };
    }
  }
  if (payload.bookmakers) {
    next = applyOddsApiIoBookmakers(next, payload);
  }
  return next;
};

export const applyOddsApiIoUpdatedFeed = async (
  items,
  { sport = "cricket" } = {}
) => {
  const result = await fetchOddsApiIoUpdatedOdds({
    sport: oddsApiIoUpdatedSportName(sport),
  });
  const byId = new Map(items.map((item) => [item.providerEventId, item]));
  for (const payload of result.odds || []) {
    const id = String(payload.id || payload.eventId || "");
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, applyOddsApiIoUpdatedPayload(existing, payload));
      continue;
    }
    const mapped = mapOddsApiIoEvent(payload);
    if (mapped) {
      byId.set(id, applyOddsApiIoBookmakers(mapped, payload));
    }
  }
  return { items: Array.from(byId.values()), usage: result.usage };
};

export const fetchOddsApiIoOddsMulti = async ({
  eventIds = [],
  bookmakers,
} = {}) => {
  if (!eventIds.length) return { odds: [], usage: { cost: 0 } };

  const apiKey = requireKey();
  const response = await axios.get(`${ODDS_API_IO_BASE_URL}/odds/multi`, {
    params: {
      apiKey,
      eventIds: eventIds.join(","),
      bookmakers: bookmakers || configuredBookmakers(),
    },
    validateStatus: (status) =>
      status === 200 || status === 403 || status === 404,
  });

  if (response.status === 404) {
    const odds = [];
    let usage = { cost: 0 };
    for (const eventId of eventIds) {
      const single = await fetchOddsApiIoOdds({ eventId, bookmakers });
      odds.push({ id: eventId, ...single.odds });
      usage = single.usage;
    }
    return { odds, usage };
  }

  return {
    odds: Array.isArray(response.data) ? response.data : [],
    usage: readUsageHeaders(response.headers),
  };
};

export const fetchOddsApiIoParticipantLogo = async (participantId) => {
  const apiKey = requireKey();
  const id = String(participantId || "").replace(/\D/g, "");
  if (!id) return { buffer: null, contentType: null };
  const response = await axios.get(
    `${ODDS_API_IO_BASE_URL}/participants/${id}/logo`,
    {
      params: { apiKey },
      responseType: "arraybuffer",
      validateStatus: (status) => status === 200 || status === 404,
    }
  );
  if (response.status !== 200 || !response.data) {
    return { buffer: null, contentType: null };
  }
  return {
    buffer: Buffer.from(response.data),
    contentType: response.headers["content-type"] || "image/png",
  };
};

const startingSoon = (event, withinMs) => {
  const start = new Date(event.date || event.startTime).getTime();
  if (Number.isNaN(start)) return false;
  return start - Date.now() <= withinMs;
};

const mergeRawEvents = (rows = []) => {
  const byId = new Map();
  for (const event of rows) {
    if (!event?.id) continue;
    const id = String(event.id);
    const previous = byId.get(id);
    if (!previous || event.status === "live" || event.clock) {
      byId.set(id, event);
    }
  }
  return Array.from(byId.values());
};

const rankOddsTarget = (item) => {
  const key = String(item.sportKey || "");
  const league = String(item.leagueName || "").toLowerCase();
  let score = item.markets?.length ? 20 : 0;
  if (key.startsWith("football")) score += 0;
  else if (key.startsWith("tennis")) score += 2;
  else score += 5;
  if (key.includes("premier_league") || league.includes("premier league")) {
    score -= 8;
  }
  return score;
};

const pickOddsTargets = (items, { statuses, withinMs, limit }) =>
  items
    .filter((item) => statuses.includes(item.status))
    .filter((item) => item.status === "live" || startingSoon(item, withinMs))
    .sort((left, right) => {
      const rank = rankOddsTarget(left) - rankOddsTarget(right);
      if (rank !== 0) return rank;
      return new Date(left.startTime) - new Date(right.startTime);
    })
    .slice(0, limit);

const attachOdds = async (
  items,
  { oddsWithinMs, maxOddsEvents, maxUpcomingEvents = 0 }
) => {
  const byId = new Map(items.map((item) => [item.providerEventId, item]));
  const liveTargets = pickOddsTargets(items, {
    statuses: ["live"],
    withinMs: oddsWithinMs,
    limit: maxOddsEvents,
  });
  const upcomingTargets = pickOddsTargets(items, {
    statuses: ["upcoming"],
    withinMs: Math.max(oddsWithinMs, 14 * 24 * 60 * 60 * 1000),
    limit: maxUpcomingEvents || (maxOddsEvents > 0 ? maxOddsEvents : 0),
  });
  const seen = new Set();
  const oddsTargets = [...liveTargets, ...upcomingTargets].filter((item) => {
    if (seen.has(item.providerEventId)) return false;
    seen.add(item.providerEventId);
    return true;
  });

  let usage = { cost: 0 };
  for (let index = 0; index < oddsTargets.length; index += 10) {
    const chunk = oddsTargets.slice(index, index + 10);
    const result = await fetchOddsApiIoOddsMulti({
      eventIds: chunk.map((item) => item.providerEventId),
    });
    usage = result.usage || usage;
    for (const payload of result.odds || []) {
      const id = String(payload.id || payload.eventId || "");
      const item = byId.get(id);
      if (!item) continue;
      byId.set(id, applyOddsApiIoBookmakers(item, payload));
    }
  }

  return { items: Array.from(byId.values()), usage };
};

export const fetchOddsApiIoFeed = async ({
  includeLive = true,
  includeUpcoming = false,
  includeSettled = false,
  sports = ODDS_API_IO_SPORT_SLUGS,
  liveSport,
  oddsWithinMs = 36 * 60 * 60 * 1000,
  maxOddsEvents = 8,
  pendingLimit = 40,
  settledLimit = 20,
  skipTestLookup = false,
  includePendingSports,
} = {}) => {
  const raw = [];
  let usage = { cost: 0 };
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const upcomingTo = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  if (includeLive && !includeUpcoming) {
    const live = await fetchOddsApiIoLiveEvents({ sport: liveSport });
    raw.push(...(live.events || []));
    usage = live.usage || usage;
    // Cricket almost never appears on /events/live (stays `pending`).
    if (!liveSport || liveSport === "cricket") {
      const cricket = await fetchOddsApiIoEvents({
        sport: "cricket",
        from,
        to: upcomingTo,
        limit: 200,
      });
      raw.push(...(cricket.events || []));
      usage = cricket.usage || usage;
    }
    const pendingSports = (
      includePendingSports === undefined
        ? ["football", "tennis"]
        : includePendingSports
    ).filter((sport) => !liveSport || liveSport === sport);
    for (const sport of pendingSports) {
      const pending = await fetchOddsApiIoEvents({
        sport,
        status: "pending",
        from: now,
        to: upcomingTo,
        limit: Math.max(pendingLimit, 60),
      });
      raw.push(...(pending.events || []));
      usage = pending.usage || usage;
    }
  }

  for (const sport of sports) {
    if (sport === "cricket" && (includeUpcoming || includeSettled)) {
      const cricket = await fetchOddsApiIoEvents({
        sport: "cricket",
        from,
        to: upcomingTo,
        limit: 200,
      });
      raw.push(...(cricket.events || []));
      usage = cricket.usage || usage;
      continue;
    }
    if (includeUpcoming) {
      const pending = await fetchOddsApiIoEvents({
        sport,
        status: "pending",
        from,
        to: upcomingTo,
        limit: pendingLimit,
      });
      raw.push(...(pending.events || []));
      usage = pending.usage || usage;
    }
    if (includeSettled) {
      const settled = await fetchOddsApiIoEvents({
        sport,
        status: "settled",
        from,
        to: now,
        limit: settledLimit,
      });
      raw.push(...(settled.events || []));
      usage = settled.usage || usage;
    }
  }

  const merged = mergeRawEvents(raw);
  const enriched = skipTestLookup
    ? { events: merged, usage }
    : await enrichSettledTests(merged);
  if (enriched.usage?.remaining != null) usage = enriched.usage;
  const items = enriched.events.map((event) => mapOddsApiIoEvent(event)).filter(Boolean);
  if (includeLive && !includeUpcoming) {
    const withOdds = await attachOdds(items, {
      oddsWithinMs,
      maxOddsEvents: Math.max(maxOddsEvents, 120),
      maxUpcomingEvents: 40,
    });
    const updated = await applyOddsApiIoUpdatedFeed(withOdds.items, {
      sport: liveSport || "football",
    });
    return {
      items: updated.items,
      usage: updated.usage?.remaining != null ? updated.usage : withOdds.usage,
    };
  }
  const withOdds =
    maxOddsEvents > 0
      ? await attachOdds(items, {
          oddsWithinMs,
          maxOddsEvents,
          maxUpcomingEvents: maxOddsEvents,
        })
      : { items, usage };
  return {
    items: withOdds.items,
    usage: withOdds.usage?.remaining != null ? withOdds.usage : usage,
  };
};

export const fetchOddsApiIoCricketFeed = (options = {}) =>
  fetchOddsApiIoFeed({
    includeLive: false,
    includeUpcoming: true,
    includeSettled: true,
    sports: ["cricket"],
    maxOddsEvents: 0,
    skipTestLookup: true,
    ...options,
  });
