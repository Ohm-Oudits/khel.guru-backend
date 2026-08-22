import assert from "node:assert/strict";

import { mapTheOddsApiOddsResponse } from "../services/sportsbookProviders/theOddsApiProvider.js";

const response = mapTheOddsApiOddsResponse(
  [
    {
      id: "event-123",
      sport_title: "Indian Premier League",
      commence_time: "2026-08-19T18:30:00.000Z",
      home_team: "Mumbai Indians",
      away_team: "Chennai Super Kings",
      bookmakers: [
        {
          key: "draft_book",
          title: "Draft Book",
          last_update: "2026-08-19T12:00:00.000Z",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Mumbai Indians", price: 1.85 },
                { name: "Chennai Super Kings", price: 2.05 },
              ],
            },
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: 1.91, point: 179.5 },
                { name: "Under", price: 1.91, point: 179.5 },
              ],
            },
            {
              key: "h2h_lay",
              outcomes: [
                { name: "Mumbai Indians", price: 1.03 },
                { name: "Chennai Super Kings", price: 48 },
              ],
            },
          ],
        },
      ],
    },
  ],
  "cricket_ipl",
  "uk"
);

assert.equal(response.length, 1, "Expected a single normalized event");
assert.equal(response[0].provider, "the-odds-api");
assert.equal(response[0].providerEventId, "event-123");
assert.equal(response[0].sportKey, "cricket_ipl");
assert.equal(
  response[0].markets.length,
  2,
  "Expected h2h and totals markets; lay quotes must be dropped"
);
assert.equal(
  response[0].markets.some((market) => market.providerMarketKey === "h2h_lay"),
  false,
  "Expected exchange lay market to be ignored"
);

const h2hMarket = response[0].markets.find((market) => market.marketType === "h2h");
assert(h2hMarket, "Expected h2h market to exist");
assert.equal(h2hMarket.title, "Match Winner");
assert.equal(h2hMarket.selections.length, 2);
assert.equal(h2hMarket.snapshots.length, 1);
assert.equal(h2hMarket.snapshots[0].outcomes[0].key, "mumbai_indians");
assert.equal(
  h2hMarket.snapshots[0].region,
  "uk",
  "Expected requested regions to be stamped on snapshots"
);

const totalsMarket = response[0].markets.find(
  (market) => market.marketType === "totals"
);
assert(totalsMarket, "Expected totals market to exist");
assert.equal(totalsMarket.selections.length, 2);
assert.equal(totalsMarket.selections[0].line, 179.5);
assert.equal(
  totalsMarket.snapshots[0].outcomes[0].key,
  "over_179.5",
  "Expected line to be encoded into the selection key"
);

const { parseOddsApiScoreCell, mapTheOddsApiScoresResponse } = await import(
  "../services/sportsbookProviders/theOddsApiProvider.js"
);
assert.deepEqual(parseOddsApiScoreCell("151/8"), { runs: 151, wickets: 8 });
assert.deepEqual(parseOddsApiScoreCell("64"), { runs: 64, wickets: null });
const scored = mapTheOddsApiScoresResponse([
  {
    id: "score-1",
    sport_key: "cricket_test_match",
    home_team: "Bangladesh",
    away_team: "Australia",
    completed: false,
    scores: [
      { name: "Bangladesh", score: "64" },
      { name: "Australia", score: "151/8" },
    ],
  },
]);
assert.equal(scored[0].scoreboard.home, 64);
assert.equal(scored[0].scoreboard.away, 151);
assert.equal(scored[0].scoreboard.awayWickets, 8);
assert.equal(scored[0].competitors[0].name, "Bangladesh");

console.log("Sportsbook provider mapper test passed");
