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
  res.set = () => res;
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

const exchangeFeed = [
  {
    provider: "the-odds-api",
    providerEventId: "exchange-vs-book-001",
    sportKey: "cricket_test_match",
    sportName: "Cricket",
    leagueName: "Test Matches",
    status: "upcoming",
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    competitors: [
      { name: "Australia", role: "away" },
      { name: "Bangladesh", role: "home" },
    ],
    markets: [
      {
        providerMarketKey: "h2h",
        marketType: "h2h",
        title: "Match Winner",
        selections: [
          { key: "australia", name: "Australia" },
          { key: "draw", name: "Draw" },
          { key: "bangladesh", name: "Bangladesh" },
        ],
        snapshots: [
          {
            bookmakerKey: "betfair_ex_uk",
            bookmakerTitle: "Betfair",
            region: "uk",
            capturedAt: new Date().toISOString(),
            outcomes: [
              { key: "australia", name: "Australia", priceDecimal: 1.02 },
              { key: "draw", name: "Draw", priceDecimal: 660 },
              { key: "bangladesh", name: "Bangladesh", priceDecimal: 46 },
            ],
          },
          {
            bookmakerKey: "betfair_ex_au",
            bookmakerTitle: "Betfair AU",
            region: "au",
            capturedAt: new Date().toISOString(),
            outcomes: [
              { key: "australia", name: "Australia", priceDecimal: 1.03 },
              { key: "draw", name: "Draw", priceDecimal: 750 },
              { key: "bangladesh", name: "Bangladesh", priceDecimal: 30 },
            ],
          },
          {
            bookmakerKey: "coral",
            bookmakerTitle: "Coral",
            region: "uk",
            capturedAt: new Date().toISOString(),
            outcomes: [
              { key: "australia", name: "Australia", priceDecimal: 1.65 },
              { key: "draw", name: "Draw", priceDecimal: 2.9 },
              { key: "bangladesh", name: "Bangladesh", priceDecimal: 8 },
            ],
          },
        ],
      },
    ],
  },
];

const exchangeResult = await ingestNormalizedSportsbookFeed(exchangeFeed);
assert.equal(exchangeResult.events.length, 1);
const exchangeMarket = await Market.findOne({
  eventId: exchangeResult.events[0]._id,
  providerMarketKey: "h2h",
}).lean();
assert.equal(
  exchangeMarket.selections.find((selection) => selection.key === "australia")
    .priceDecimal,
  1.03,
  "best back is MAX across exchanges"
);
assert.equal(
  exchangeMarket.selections.find((selection) => selection.key === "bangladesh")
    .priceDecimal,
  46
);
assert.equal(
  exchangeMarket.selections.find((selection) => selection.key === "draw")
    .priceDecimal,
  750
);
console.log("best exchange back is MAX, not a sportsbook price");

const houseFeed = [
  {
    provider: "mock",
    providerEventId: "live-cricket-ban-aus-test",
    sportKey: "cricket_test_match",
    sportName: "Cricket",
    leagueName: "2nd Test",
    status: "live",
    startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    competitors: [
      { name: "Bangladesh", shortName: "BAN", role: "home" },
      { name: "Australia", shortName: "AUS", role: "away" },
    ],
    markets: [
      {
        providerMarketKey: "h2h",
        marketType: "h2h",
        title: "Match Winner",
        selections: [
          { key: "bangladesh", name: "Bangladesh" },
          { key: "draw", name: "Draw" },
          { key: "australia", name: "Australia" },
        ],
        snapshots: [
          {
            bookmakerKey: "mockbook",
            bookmakerTitle: "Mockbook",
            region: "in",
            capturedAt: new Date().toISOString(),
            outcomes: [
              { key: "bangladesh", name: "Bangladesh", priceDecimal: 7.5 },
              { key: "draw", name: "Draw", priceDecimal: 3.0 },
              { key: "australia", name: "Australia", priceDecimal: 1.65 },
            ],
          },
        ],
      },
    ],
  },
];

await ingestNormalizedSportsbookFeed(houseFeed);

const oddsOntoHouse = [
  {
    provider: "the-odds-api",
    providerEventId: "odds-ban-aus",
    sportKey: "cricket_test_match",
    sportName: "Cricket",
    leagueName: "Test Matches",
    status: "live",
    startTime: new Date().toISOString(),
    competitors: [
      { name: "Bangladesh", shortName: "BAN", role: "home" },
      { name: "Australia", shortName: "AUS", role: "away" },
    ],
    markets: [
      {
        providerMarketKey: "h2h",
        marketType: "h2h",
        title: "Match Winner",
        selections: [
          { key: "australia", name: "Australia" },
          { key: "draw", name: "Draw" },
          { key: "bangladesh", name: "Bangladesh" },
        ],
        snapshots: [
          {
            bookmakerKey: "betfair_ex_uk",
            bookmakerTitle: "Betfair",
            region: "uk",
            capturedAt: new Date().toISOString(),
            outcomes: [
              { key: "australia", name: "Australia", priceDecimal: 1.03 },
              { key: "bangladesh", name: "Bangladesh", priceDecimal: 34 },
              { key: "draw", name: "Draw", priceDecimal: 750 },
            ],
          },
          {
            bookmakerKey: "paddypower",
            bookmakerTitle: "Paddy Power",
            region: "uk",
            capturedAt: new Date().toISOString(),
            outcomes: [
              { key: "australia", name: "Australia", priceDecimal: 1.02 },
              { key: "bangladesh", name: "Bangladesh", priceDecimal: 26 },
              { key: "draw", name: "Draw", priceDecimal: 126 },
            ],
          },
        ],
      },
    ],
  },
];

const merged = await ingestNormalizedSportsbookFeed(oddsOntoHouse);
assert.equal(merged.events[0].provider, "mock", "Odds API should attach to the house event");
const mergedMarket = await Market.findOne({
  eventId: merged.events[0]._id,
  providerMarketKey: "h2h",
}).lean();
assert.equal(
  mergedMarket.selections.find((selection) => selection.key === "australia")
    .priceDecimal,
  1.03,
  "house mock 1.65 must not beat the best exchange back"
);
assert.equal(
  mergedMarket.selections.find((selection) => selection.key === "bangladesh")
    .priceDecimal,
  34
);
assert.equal(
  mergedMarket.selections.find((selection) => selection.key === "draw")
    .priceDecimal,
  750
);
console.log("house mock prices do not beat best exchange back");

const layFeed = [
  {
    provider: "the-odds-api",
    providerEventId: "exchange-lay-001",
    sportKey: "cricket_test_match",
    sportName: "Cricket",
    leagueName: "Test Matches",
    status: "upcoming",
    startTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    competitors: [
      { name: "Australia", role: "away" },
      { name: "Bangladesh", role: "home" },
    ],
    markets: [
      {
        providerMarketKey: "h2h_lay",
        marketType: "h2h",
        title: "Match Winner Lay",
        selections: [
          { key: "australia", name: "Australia" },
          { key: "bangladesh", name: "Bangladesh" },
        ],
        snapshots: [
          {
            bookmakerKey: "betfair_ex_uk",
            bookmakerTitle: "Betfair",
            region: "uk",
            capturedAt: new Date().toISOString(),
            outcomes: [
              { key: "australia", name: "Australia", priceDecimal: 1.05 },
              { key: "bangladesh", name: "Bangladesh", priceDecimal: 36 },
            ],
          },
          {
            bookmakerKey: "betfair_ex_au",
            bookmakerTitle: "Betfair AU",
            region: "au",
            capturedAt: new Date().toISOString(),
            outcomes: [
              { key: "australia", name: "Australia", priceDecimal: 1.04 },
              { key: "bangladesh", name: "Bangladesh", priceDecimal: 38 },
            ],
          },
        ],
      },
    ],
  },
];

const layResult = await ingestNormalizedSportsbookFeed(layFeed);
const layMarket = await Market.findOne({
  eventId: layResult.events[0]._id,
  providerMarketKey: "h2h_lay",
}).lean();
assert.equal(
  layMarket.selections.find((selection) => selection.key === "australia")
    .priceDecimal,
  1.04,
  "best lay is MIN across exchanges"
);
assert.equal(
  layMarket.selections.find((selection) => selection.key === "bangladesh")
    .priceDecimal,
  36
);
console.log("best exchange lay is MIN");

await mongoose.disconnect();
await mongod.stop();
