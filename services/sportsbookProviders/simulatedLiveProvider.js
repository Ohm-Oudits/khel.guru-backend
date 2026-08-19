import { normalizeSelectionKey } from "./theOddsApiProvider.js";

// Stateful sandbox provider: staggered fixtures progress upcoming -> live ->
// completed on wall-clock time, drift odds, then respawn a fresh generation so
// demos never run dry. State advances lazily on each fetch, so both scheduler
// ticks and manual admin ingests move the simulation forward.
//
// Contract note: this provider never emits event status "settled" — completion
// is signalled via scoreboard.completed = true; only the settlement service
// transitions event status.

const BOOKMAKER = { key: "simbook", title: "Simbook" };
const MINUTE_MS = 60 * 1000;

const matchDurationMs = () =>
  Number(process.env.SPORTSBOOK_SIM_MATCH_MINUTES || 10) * MINUTE_MS;

const simTickMs = () => Number(process.env.SPORTSBOOK_SIM_TICK_MS || 15000);

// Completed events stay in the feed briefly so ingest + settlement see the
// final scoreboard before the fixture respawns.
const completedLingerMs = () => 2 * simTickMs();

const TEMPLATES = [
  {
    slug: "ipl-mi-csk",
    sportKey: "cricket_ipl",
    sportGroup: "cricket",
    sportName: "Cricket",
    leagueName: "Indian Premier League",
    home: "Mumbai Indians",
    away: "Chennai Super Kings",
    startOffsetMs: -3 * MINUTE_MS,
    kind: "cricket",
    basePrices: [1.8, 2.02],
    totalsLine: 179.5,
  },
  {
    slug: "ipl-rcb-kkr",
    sportKey: "cricket_ipl",
    sportGroup: "cricket",
    sportName: "Cricket",
    leagueName: "Indian Premier League",
    home: "Royal Challengers Bengaluru",
    away: "Kolkata Knight Riders",
    startOffsetMs: 2 * MINUTE_MS,
    kind: "cricket",
    basePrices: [1.95, 1.87],
    totalsLine: 169.5,
  },
  {
    slug: "epl-ars-liv",
    sportKey: "soccer_epl",
    sportGroup: "football",
    sportName: "Football",
    leagueName: "Premier League",
    home: "Arsenal",
    away: "Liverpool",
    startOffsetMs: 5 * MINUTE_MS,
    kind: "football",
    basePrices: [2.1, 3.4, 3.3],
    totalsLine: 2.5,
  },
  {
    slug: "epl-mci-che",
    sportKey: "soccer_epl",
    sportGroup: "football",
    sportName: "Football",
    leagueName: "Premier League",
    home: "Manchester City",
    away: "Chelsea",
    startOffsetMs: 30 * MINUTE_MS,
    kind: "football",
    basePrices: [1.65, 3.9, 5.2],
    totalsLine: 3.5,
  },
  {
    slug: "atp-sinner-alcaraz",
    sportKey: "tennis_atp",
    sportGroup: "tennis",
    sportName: "Tennis",
    leagueName: "ATP Tour",
    home: "Jannik Sinner",
    away: "Carlos Alcaraz",
    startOffsetMs: 2 * 60 * MINUTE_MS,
    kind: "two-way",
    basePrices: [1.9, 1.9],
    totalsLine: null,
  },
  {
    slug: "bwf-sen-axelsen",
    sportKey: "badminton_bwf",
    sportGroup: "badminton",
    sportName: "Badminton",
    leagueName: "BWF World Tour",
    home: "Lakshya Sen",
    away: "Viktor Axelsen",
    startOffsetMs: 6 * 60 * MINUTE_MS,
    kind: "two-way",
    basePrices: [2.25, 1.64],
    totalsLine: null,
  },
];

let instances = null;

const clampPrice = (value) => Math.min(20, Math.max(1.05, value));

const buildInitialPrices = (template) => {
  const prices = { [normalizeSelectionKey(template.home)]: template.basePrices[0] };

  if (template.kind === "football") {
    prices.draw = template.basePrices[1];
    prices[normalizeSelectionKey(template.away)] = template.basePrices[2];
  } else {
    prices[normalizeSelectionKey(template.away)] = template.basePrices[1];
  }

  if (template.totalsLine !== null) {
    prices[normalizeSelectionKey("Over", template.totalsLine)] = 1.91;
    prices[normalizeSelectionKey("Under", template.totalsLine)] = 1.91;
  }

  return prices;
};

const createInstance = (template, generation, now) => ({
  template,
  generation,
  startTime:
    generation === 1
      ? now + template.startOffsetMs
      : now + (2 + (template.startOffsetMs / MINUTE_MS % 5 + 5) % 5) * MINUTE_MS,
  prices: buildInitialPrices(template),
  scoreboard: { home: 0, away: 0 },
  finalScoreboard: null,
  lastScoreAdvanceAt: 0,
});

const ensureInstances = () => {
  if (!instances) {
    const now = Date.now();
    instances = TEMPLATES.map((template) => createInstance(template, 1, now));
  }
  return instances;
};

export const resetSimulation = () => {
  instances = null;
};

const instanceStatus = (instance, now) => {
  const elapsed = now - instance.startTime;
  if (elapsed < 0) return "upcoming";
  if (elapsed < matchDurationMs()) return "live";
  return "completed";
};

// Multiplicative random walk, lightly renormalized toward ~105% overround.
// Roughly 30% of ticks change nothing so change-detection gets exercised.
const driftPrices = (instance, status) => {
  if (status === "upcoming" && Math.random() < 0.5) return;
  if (Math.random() < 0.3) return;

  const { prices, scoreboard, template } = instance;
  const homeKey = normalizeSelectionKey(template.home);
  const awayKey = normalizeSelectionKey(template.away);
  const leaderKey =
    scoreboard.home > scoreboard.away
      ? homeKey
      : scoreboard.away > scoreboard.home
        ? awayKey
        : null;

  const h2hKeys = Object.keys(prices).filter(
    (key) => !key.startsWith("over_") && !key.startsWith("under_")
  );

  for (const key of h2hKeys) {
    let factor = 1 + (Math.random() * 0.06 - 0.03);
    if (status === "live" && leaderKey) {
      factor *= key === leaderKey ? 0.985 : 1.015;
    }
    prices[key] = clampPrice(prices[key] * factor);
  }

  // Renormalize the h2h book toward 105% overround.
  const overround = h2hKeys.reduce((sum, key) => sum + 1 / prices[key], 0);
  if (overround > 0) {
    const correction = overround / 1.05;
    for (const key of h2hKeys) {
      prices[key] = clampPrice(prices[key] * correction);
    }
  }

  for (const key of Object.keys(prices)) {
    if (key.startsWith("over_") || key.startsWith("under_")) {
      prices[key] = clampPrice(prices[key] * (1 + (Math.random() * 0.04 - 0.02)));
    }
    prices[key] = Number(prices[key].toFixed(2));
  }
};

const advanceScoreboard = (instance, status, now) => {
  const { template, scoreboard } = instance;

  if (status !== "live") return;
  if (now - instance.lastScoreAdvanceAt < simTickMs() * 0.9) return;
  instance.lastScoreAdvanceAt = now;

  const progress = Math.min(1, (now - instance.startTime) / matchDurationMs());

  if (template.kind === "football") {
    scoreboard.minute = Math.min(90, Math.floor(progress * 90));
    if (Math.random() < 0.08) {
      if (Math.random() < 0.55) scoreboard.home += 1;
      else scoreboard.away += 1;
    }
  } else if (template.kind === "cricket") {
    const innings = progress < 0.5 ? 1 : 2;
    scoreboard.innings = innings;
    scoreboard.overs = Number((Math.min(1, progress * 2 - (innings - 1)) * 20).toFixed(1));
    const battingSide = innings === 1 ? "home" : "away";
    if (Math.random() < 0.85) {
      scoreboard[battingSide] += Math.floor(Math.random() * 10);
    }
    scoreboard.wickets = scoreboard.wickets || { home: 0, away: 0 };
    if (Math.random() < 0.12 && scoreboard.wickets[battingSide] < 10) {
      scoreboard.wickets[battingSide] += 1;
    }
  } else {
    // Rally-scored sports: points accumulate on both sides.
    if (Math.random() < 0.9) {
      scoreboard.home += Math.floor(Math.random() * 3);
      scoreboard.away += Math.floor(Math.random() * 3);
    }
  }
};

const buildMarkets = (instance, now) => {
  const { template, prices } = instance;
  const homeKey = normalizeSelectionKey(template.home);
  const awayKey = normalizeSelectionKey(template.away);
  const capturedAt = new Date(now).toISOString();

  const h2hSelections = [
    { key: homeKey, name: template.home },
    ...(template.kind === "football" ? [{ key: "draw", name: "Draw" }] : []),
    { key: awayKey, name: template.away },
  ];

  const markets = [
    {
      providerMarketKey: "h2h",
      marketType: "h2h",
      title: "Match Winner",
      selections: h2hSelections.map(({ key, name }) => ({ key, name })),
      snapshots: [
        {
          bookmakerKey: BOOKMAKER.key,
          bookmakerTitle: BOOKMAKER.title,
          region: "in",
          capturedAt,
          outcomes: h2hSelections.map(({ key, name }) => ({
            key,
            name,
            priceDecimal: prices[key],
          })),
        },
      ],
    },
  ];

  if (template.totalsLine !== null) {
    const overKey = normalizeSelectionKey("Over", template.totalsLine);
    const underKey = normalizeSelectionKey("Under", template.totalsLine);

    markets.push({
      providerMarketKey: "totals",
      marketType: "totals",
      title: "Totals",
      selections: [
        { key: overKey, name: "Over", line: template.totalsLine },
        { key: underKey, name: "Under", line: template.totalsLine },
      ],
      snapshots: [
        {
          bookmakerKey: BOOKMAKER.key,
          bookmakerTitle: BOOKMAKER.title,
          region: "in",
          capturedAt,
          outcomes: [
            {
              key: overKey,
              name: "Over",
              line: template.totalsLine,
              priceDecimal: prices[overKey],
            },
            {
              key: underKey,
              name: "Under",
              line: template.totalsLine,
              priceDecimal: prices[underKey],
            },
          ],
        },
      ],
    });
  }

  return markets;
};

export const fetchSimulatedLiveFeed = async () => {
  const now = Date.now();
  const feed = [];

  for (let i = 0; i < ensureInstances().length; i += 1) {
    let instance = instances[i];
    const status = instanceStatus(instance, now);

    if (status === "completed") {
      if (!instance.finalScoreboard) {
        instance.finalScoreboard = {
          ...instance.scoreboard,
          completed: true,
        };
      }

      const lingerEnd = instance.startTime + matchDurationMs() + completedLingerMs();
      if (now > lingerEnd) {
        // Respawn a fresh generation with a future start time.
        instance = createInstance(instance.template, instance.generation + 1, now);
        instances[i] = instance;
      } else {
        feed.push({
          provider: "simulated",
          providerEventId: `sim-${instance.template.slug}-${instance.generation}`,
          sportKey: instance.template.sportKey,
          sportName: instance.template.sportName,
          leagueName: instance.template.leagueName,
          status: "live",
          startTime: new Date(instance.startTime).toISOString(),
          competitors: [
            { name: instance.template.home, role: "home" },
            { name: instance.template.away, role: "away" },
          ],
          scoreboard: instance.finalScoreboard,
          markets: buildMarkets(instance, now),
        });
        continue;
      }
    }

    const freshStatus = instanceStatus(instance, now);
    driftPrices(instance, freshStatus);
    advanceScoreboard(instance, freshStatus, now);

    feed.push({
      provider: "simulated",
      providerEventId: `sim-${instance.template.slug}-${instance.generation}`,
      sportKey: instance.template.sportKey,
      sportName: instance.template.sportName,
      leagueName: instance.template.leagueName,
      status: freshStatus === "upcoming" ? "upcoming" : "live",
      startTime: new Date(instance.startTime).toISOString(),
      competitors: [
        { name: instance.template.home, role: "home" },
        { name: instance.template.away, role: "away" },
      ],
      scoreboard:
        freshStatus === "live" ? { ...instance.scoreboard } : {},
      markets: buildMarkets(instance, now),
    });
  }

  return feed;
};
