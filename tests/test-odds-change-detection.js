import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const { default: Market } = await import("../models/market.model.js");
const { default: OddsSnapshot } = await import("../models/oddsSnapshot.model.js");
const { default: SportsEvent } = await import("../models/sportsEvent.model.js");
const { ingestNormalizedSportsbookFeed, computeOddsSignature } = await import(
  "../services/sportsbookIngest.service.js"
);

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());
await Promise.all([Market.init(), OddsSnapshot.init(), SportsEvent.init()]);

const buildFeed = (homePrice) => [
  {
    provider: "mock",
    providerEventId: "cd-test-001",
    sportKey: "cricket_ipl",
    sportName: "Cricket",
    leagueName: "Indian Premier League",
    status: "upcoming",
    startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    competitors: [
      { name: "Mumbai Indians", role: "home" },
      { name: "Chennai Super Kings", role: "away" },
    ],
    markets: [
      {
        providerMarketKey: "h2h",
        marketType: "h2h",
        title: "Match Winner",
        selections: [
          { key: "mumbai_indians", name: "Mumbai Indians" },
          { key: "chennai_super_kings", name: "Chennai Super Kings" },
        ],
        snapshots: [
          {
            bookmakerKey: "mockbook",
            bookmakerTitle: "Mockbook",
            region: "in",
            capturedAt: new Date().toISOString(),
            outcomes: [
              {
                key: "mumbai_indians",
                name: "Mumbai Indians",
                priceDecimal: homePrice,
              },
              {
                key: "chennai_super_kings",
                name: "Chennai Super Kings",
                priceDecimal: 2.02,
              },
            ],
          },
        ],
      },
    ],
  },
];

// Signature is order-insensitive and price-sensitive.
const sigA = computeOddsSignature([
  { key: "a", priceDecimal: 1.5, line: null },
  { key: "b", priceDecimal: 2.5, line: null },
]);
const sigB = computeOddsSignature([
  { key: "b", priceDecimal: 2.5, line: null },
  { key: "a", priceDecimal: 1.5, line: null },
]);
const sigC = computeOddsSignature([
  { key: "a", priceDecimal: 1.51, line: null },
  { key: "b", priceDecimal: 2.5, line: null },
]);
assert.equal(sigA, sigB);
assert.notEqual(sigA, sigC);
console.log("odds signature is canonical and price-sensitive");

// First ingest creates one snapshot and reports changes.
const first = await ingestNormalizedSportsbookFeed(buildFeed(1.8));
assert.equal(first.events.length, 1);
assert.equal(first.changes.length, 1);
assert.equal(first.changes[0].marketChanges.length, 1);
assert.equal(await OddsSnapshot.countDocuments(), 1);

const event = first.events[0];
assert.equal(event.sportGroup, "cricket", "sportGroup resolved from provider key");

// Re-ingesting an identical feed inserts nothing and reports no market change.
const second = await ingestNormalizedSportsbookFeed(buildFeed(1.8));
assert.equal(await OddsSnapshot.countDocuments(), 1, "unchanged feed added a snapshot");
const secondMarketChanges = second.changes.flatMap((change) => change.marketChanges);
assert.equal(secondMarketChanges.length, 0, "unchanged feed reported market changes");

// A single price change inserts exactly one snapshot and updates latestOdds
// plus the denormalized selection price.
const third = await ingestNormalizedSportsbookFeed(buildFeed(1.95));
assert.equal(await OddsSnapshot.countDocuments(), 2, "price change should add one snapshot");
assert.equal(third.changes.length, 1);
assert.equal(third.changes[0].marketChanges.length, 1);
assert.equal(
  third.changes[0].marketChanges[0].changedBookmakers[0].bookmakerKey,
  "mockbook"
);

const market = await Market.findOne({ providerMarketKey: "h2h" }).lean();
assert.equal(market.latestOdds.length, 1);
assert.equal(
  market.latestOdds[0].outcomes.find((o) => o.key === "mumbai_indians").priceDecimal,
  1.95
);
const homeSelection = market.selections.find((s) => s.key === "mumbai_indians");
assert.equal(homeSelection.priceDecimal, 1.95, "selection price denormalized");
assert(homeSelection.priceUpdatedAt, "selection price timestamp set");
console.log("odds change detection inserts snapshots only on change");

// Settled events are never reopened or mutated by provider feeds.
await SportsEvent.updateOne({ _id: event._id }, { $set: { status: "settled" } });
const fourth = await ingestNormalizedSportsbookFeed(buildFeed(2.5));
assert.equal(fourth.events.length, 0);
assert.equal(await OddsSnapshot.countDocuments(), 2);
const settled = await SportsEvent.findById(event._id).lean();
assert.equal(settled.status, "settled");
console.log("settled events are immune to provider feed updates");

// Hydrated list endpoint embeds markets with current prices in one query.
const { getSportsbookEvents } = await import("../controllers/sportsbook.controller.js");

const makeRes = () => {
  const res = { statusCode: 200 };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

const hydratedRes = makeRes();
await getSportsbookEvents(
  { query: { sportKey: "cricket", hydrate: "1" } },
  hydratedRes,
  (error) => {
    throw error;
  }
);

assert.equal(hydratedRes.body.count, 1);
const hydratedEvent = hydratedRes.body.events[0];
assert.equal(hydratedEvent.rawPayload, undefined, "rawPayload must be projected out");
assert.equal(hydratedEvent.markets.length, 1);
assert.equal(
  hydratedEvent.markets[0].selections.find((s) => s.key === "mumbai_indians")
    .priceDecimal,
  1.95
);
assert.equal(hydratedEvent.markets[0].latestOdds[0].signature, undefined);
console.log("hydrated events endpoint embeds markets and prices in one query");

await mongoose.disconnect();
await mongod.stop();
