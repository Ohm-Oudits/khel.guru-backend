import assert from "node:assert/strict";

import {
  applyOddsApiIoBookmakers,
  applyOddsApiIoUpdatedPayload,
  isOddsApiIoStumps,
  mapOddsApiIoEvent,
  mapOddsApiIoStatus,
  oddsApiIoUpdatedSportName,
  sportKeyFromOddsApiIoEvent,
  sportKeyFromOddsApiIoLeague,
} from "../services/sportsbookProviders/oddsApiIoProvider.js";

assert.equal(
  sportKeyFromOddsApiIoLeague("International - Test Series Australia vs Bangladesh"),
  "cricket_test_match"
);
assert.equal(
  sportKeyFromOddsApiIoLeague("India - T20 Kerala Cricket League"),
  "cricket_t20"
);
assert.equal(
  sportKeyFromOddsApiIoLeague("England - One-Day Cup, Women"),
  "cricket_odi"
);

const live = mapOddsApiIoEvent({
  id: 71001226,
  home: "Australia",
  away: "Bangladesh",
  date: "2026-08-22T00:00:00Z",
  status: "live",
  sport: { name: "Cricket", slug: "cricket" },
  league: { name: "International - Test Series Australia vs Bangladesh" },
  scores: { home: 165, away: 64 },
});
assert.equal(live.provider, "odds-api-io");
assert.equal(live.sportKey, "cricket_test_match");
assert.equal(live.status, "live");
assert.equal(live.scoreboard.home, 165);
assert.equal(live.competitors[0].name, "Australia");

const now = Date.parse("2026-08-22T12:00:00Z");
assert.equal(mapOddsApiIoStatus("pending", "2026-08-22T23:00:00Z", now), "upcoming");
assert.equal(mapOddsApiIoStatus("pending", "2026-08-22T08:00:00Z", now), "live");

const startedPending = mapOddsApiIoEvent(
  {
    id: 73237394,
    home: "South Delhi Superstars",
    away: "North Delhi Strikers",
    date: "2026-08-22T08:00:00Z",
    status: "pending",
    sport: { name: "Cricket", slug: "cricket" },
    league: { name: "India - T20 Delhi Premier League, Women" },
  },
  now
);
assert.equal(startedPending.status, "live");

const futurePending = mapOddsApiIoEvent(
  {
    id: 71173662,
    home: "Antigua And Barbuda Falcons",
    away: "Trinbago Knight Riders",
    date: "2026-08-22T23:00:00Z",
    status: "pending",
    sport: { name: "Cricket", slug: "cricket" },
    league: { name: "West Indies - Caribbean Premier League" },
  },
  now
);
assert.equal(futurePending.status, "upcoming");

const testStumps = {
  id: 71001226,
  home: "Australia",
  away: "Bangladesh",
  date: "2026-08-22T00:00:00Z",
  status: "settled",
  sport: { name: "Cricket", slug: "cricket" },
  league: { name: "International - Test Series Australia vs Bangladesh" },
  scores: { home: 165, away: 64 },
};
assert.equal(isOddsApiIoStumps(testStumps), true);
const mappedStumps = mapOddsApiIoEvent(testStumps, now);
assert.equal(mappedStumps.status, "live");
assert.equal(mappedStumps.completed, false);
assert.equal(mappedStumps.scoreboard.stumps, true);

const finishedTest = mapOddsApiIoEvent(
  {
    ...testStumps,
    id: 4,
    scores: { home: 412, away: 201, winner: "Australia" },
  },
  now
);
assert.equal(finishedTest.status, "settled");
assert.equal(finishedTest.completed, true);
assert.equal(finishedTest.scoreboard.stumps, false);

assert.equal(
  mapOddsApiIoEvent({
    id: 1,
    home: "A1",
    away: "B4",
    status: "pending",
    league: { name: "Playoffs" },
  }),
  null,
  "placeholder playoff slots are not bettable events"
);
const oldSettled = mapOddsApiIoEvent({
  id: 2,
  home: "Spain",
  away: "Portugal",
  date: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  status: "settled",
  sport: { name: "Cricket", slug: "cricket" },
  league: { name: "T20 World Cup" },
});
assert.equal(oldSettled, null, "settled events older than 24h are dropped");

const recentSettled = mapOddsApiIoEvent({
  id: 3,
  home: "Spain",
  away: "Portugal",
  date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  status: "settled",
  sport: { name: "Football", slug: "football" },
  league: { name: "Spain - La Liga", slug: "spain-la-liga" },
  scores: { home: 2, away: 1 },
});
assert.equal(recentSettled.status, "settled");
assert.equal(recentSettled.completed, true);
assert.equal(recentSettled.sportKey, "football_spain_la_liga");
assert.equal(sportKeyFromOddsApiIoEvent({
  sport: { slug: "american-football" },
  league: { slug: "usa-nfl", name: "USA - NFL" },
}), "americanfootball_usa_nfl");

const cpl = mapOddsApiIoEvent({
  id: 71173662,
  home: "Antigua And Barbuda Falcons",
  away: "Trinbago Knight Riders",
  date: "2026-08-22T23:00:00Z",
  status: "pending",
  league: { name: "West Indies - Caribbean Premier League" },
});
const priced = applyOddsApiIoBookmakers(cpl, {
  bookmakers: {
    Bet365: [{ name: "ML", odds: [{ home: "2.50", away: "1.53" }] }],
    Unibet: [{ name: "ML", odds: [{ home: "2.60", away: "1.48" }] }],
  },
});
assert.equal(priced.markets.length, 1);
assert.equal(priced.markets[0].snapshots.length, 2);
assert.equal(
  priced.markets[0].snapshots[0].outcomes.find((row) => row.name.includes("Falcons"))
    .priceDecimal,
  2.5
);
assert.equal(
  priced.markets[0].selections.some((row) => row.key === "trinbago_knight_riders"),
  true
);

const liveFootball = mapOddsApiIoEvent({
  id: 69462256,
  home: "Uni Lions",
  away: "CTBC Brothers",
  date: "2026-08-22T08:00:00Z",
  status: "live",
  sport: { name: "Baseball", slug: "baseball" },
  league: { name: "Chinese Taipei - CPBL", slug: "chinese-taipei-cpbl" },
  scores: { home: 5, away: 3, periods: { p8: { home: 0, away: 3 } } },
  clock: { running: false, statusDetail: "9th inning" },
});
assert.equal(oddsApiIoUpdatedSportName("football"), "Football");
assert.equal(oddsApiIoUpdatedSportName("american-football"), "American Football");
assert.equal(liveFootball.status, "live");
assert.equal(liveFootball.sportKey, "baseball_chinese_taipei_cpbl");
assert.equal(liveFootball.scoreboard.home, 5);
assert.equal(liveFootball.scoreboard.away, 3);
assert.equal(liveFootball.scoreboard.session, "9th inning");

const unpublished = mapOddsApiIoEvent({
  id: 73495166,
  home: "Nugegoda Sports Welfare Club",
  away: "Panadura SC",
  date: "2026-08-22T04:15:00Z",
  status: "pending",
  sport: { name: "Cricket", slug: "cricket" },
  league: { name: "Sri Lanka - Major Clubs Limited Over Tournament, Group A" },
  scores: { home: 0, away: 0 },
});
assert.equal(unpublished.status, "live");
assert.equal(unpublished.scoreboard.home, 0);
assert.equal(unpublished.scoreboard.away, 0);

const refreshed = applyOddsApiIoUpdatedPayload(unpublished, {
  id: 73495166,
  home: "Nugegoda Sports Welfare Club",
  away: "Panadura SC",
  status: "pending",
  scores: { home: 128, away: 64, periods: { ft: { home: 128, away: 64 } } },
  bookmakers: {
    Bet365: [{ name: "ML", odds: [{ home: "1.80", away: "2.00" }] }],
  },
});
assert.equal(refreshed.scoreboard.home, 128);
assert.equal(refreshed.scoreboard.away, 64);
assert.equal(refreshed.markets.length, 1);

const hull = mapOddsApiIoEvent({
  id: 72221156,
  home: "Hull City",
  away: "Manchester United",
  homeId: 101,
  awayId: 202,
  date: "2026-08-22T11:30:00Z",
  status: "live",
  sport: { name: "Football", slug: "football" },
  league: { name: "England - Premier League", slug: "england-premier-league" },
  scores: { home: 1, away: 0 },
  clock: { minute: 19, statusDetail: "1st half" },
});
assert.equal(hull.sportKey, "football_england_premier_league");
assert.equal(hull.metadata.homeId, 101);
assert.equal(hull.metadata.awayId, 202);
assert.equal(hull.scoreboard.clock.minute, 19);
const hullPriced = applyOddsApiIoBookmakers(hull, {
  bookmakers: {
    "1xbet": [
      { name: "ML", odds: [{ home: "3.70", draw: "3.75", away: "2.00" }] },
      { name: "Totals" },
      { name: "BTTS" },
    ],
  },
});
assert.equal(hullPriced.markets[0].title, "Match Result");
assert.equal(hullPriced.metadata.marketCount, 3);
assert.equal(
  hullPriced.markets[0].snapshots[0].outcomes.find((row) => row.name === "Hull City")
    .priceDecimal,
  3.7
);

const alcaraz = mapOddsApiIoEvent({
  id: 801,
  home: "Carlos Alcaraz",
  away: "Jannik Sinner",
  date: "2026-08-22T16:00:00Z",
  status: "live",
  sport: { name: "Tennis", slug: "tennis" },
  league: { name: "ATP - Cincinnati", slug: "atp-cincinnati" },
  scores: { home: 1, away: 0 },
  clock: { statusDetail: "2nd set" },
});
assert.equal(alcaraz.sportKey, "tennis_atp_cincinnati");
const alcarazPriced = applyOddsApiIoBookmakers(alcaraz, {
  bookmakers: {
    "1xbet": [{ name: "ML", odds: [{ home: "1.55", away: "2.40" }] }],
  },
});
assert.equal(alcarazPriced.markets[0].title, "Match Winner");
assert.equal(alcarazPriced.markets[0].selections.length, 2);

console.log("odds-api.io sports mapper passed");
