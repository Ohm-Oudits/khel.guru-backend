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
assert.equal(response[0].markets.length, 2, "Expected h2h and totals markets");

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

console.log("Sportsbook provider mapper test passed");
