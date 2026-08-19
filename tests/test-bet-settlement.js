import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const { default: User } = await import("../models/user.model.js");
const { default: SportsEvent } = await import("../models/sportsEvent.model.js");
const { default: Market } = await import("../models/market.model.js");
const { default: SportsBet } = await import("../models/sportsBet.model.js");
const { default: LedgerEntry } = await import("../models/ledgerEntry.model.js");
const { determineSelectionResult, settleEvent } = await import(
  "../services/betSettlement.service.js"
);
const { ensureDefaultWalletAccounts, mapWalletAccountsByType } = await import(
  "../services/walletPlatform.service.js"
);
const { default: WalletAccount } = await import("../models/walletAccount.model.js");

// ---------- pure result-determination matrix ----------

const event = (home, away, competitors = null) => ({
  scoreboard: { home, away, completed: true },
  competitors:
    competitors || [
      { name: "Mumbai Indians", role: "home" },
      { name: "Chennai Super Kings", role: "away" },
    ],
});

const h2hMarket = (withDraw = false) => ({
  marketType: "h2h",
  selections: [
    { key: "mumbai_indians", name: "Mumbai Indians" },
    ...(withDraw ? [{ key: "draw", name: "Draw" }] : []),
    { key: "chennai_super_kings", name: "Chennai Super Kings" },
  ],
});

const sel = (key, line = null) => ({ key, name: key, line });

// h2h: home win / away win
assert.equal(
  determineSelectionResult({ market: h2hMarket(), selection: sel("mumbai_indians"), event: event(180, 160) }),
  "won"
);
assert.equal(
  determineSelectionResult({ market: h2hMarket(), selection: sel("chennai_super_kings"), event: event(180, 160) }),
  "lost"
);
// h2h: draw selection wins on equal scores, team selections lose
assert.equal(
  determineSelectionResult({ market: h2hMarket(true), selection: sel("draw"), event: event(1, 1) }),
  "won"
);
assert.equal(
  determineSelectionResult({ market: h2hMarket(true), selection: sel("mumbai_indians"), event: event(1, 1) }),
  "lost"
);
// h2h: tie WITHOUT a draw selection refunds
assert.equal(
  determineSelectionResult({ market: h2hMarket(false), selection: sel("mumbai_indians"), event: event(150, 150) }),
  "void"
);
// h2h: unmatchable selection refunds, never guesses
assert.equal(
  determineSelectionResult({ market: h2hMarket(), selection: sel("some_unknown_team"), event: event(2, 0) }),
  "void"
);

// totals: over / under / push
const totalsMarket = { marketType: "totals", selections: [] };
assert.equal(
  determineSelectionResult({ market: totalsMarket, selection: sel("over_179.5", 179.5), event: event(120, 80) }),
  "won"
);
assert.equal(
  determineSelectionResult({ market: totalsMarket, selection: sel("under_179.5", 179.5), event: event(120, 80) }),
  "lost"
);
assert.equal(
  determineSelectionResult({ market: totalsMarket, selection: sel("over_200", 200), event: event(120, 80) }),
  "void",
  "whole-number push must void"
);
// totals: line recoverable from the key when the selection lacks it
assert.equal(
  determineSelectionResult({ market: totalsMarket, selection: sel("under_2.5"), event: event(1, 0) }),
  "won"
);

// spreads: cover / fail / push
const spreadsMarket = { marketType: "spreads", selections: [] };
assert.equal(
  determineSelectionResult({
    market: spreadsMarket,
    selection: sel("mumbai_indians_-2.5", -2.5),
    event: event(180, 160),
  }),
  "won"
);
assert.equal(
  determineSelectionResult({
    market: spreadsMarket,
    selection: sel("chennai_super_kings_2.5", 2.5),
    event: event(180, 160),
  }),
  "lost"
);
assert.equal(
  determineSelectionResult({
    market: spreadsMarket,
    selection: sel("mumbai_indians_-20", -20),
    event: event(180, 160),
  }),
  "void",
  "exact spread push must void"
);

// unknown market types refund
assert.equal(
  determineSelectionResult({ market: { marketType: "outrights" }, selection: sel("x"), event: event(1, 0) }),
  "void"
);
// missing scoreboard refunds
assert.equal(
  determineSelectionResult({ market: h2hMarket(), selection: sel("mumbai_indians"), event: { scoreboard: {} } }),
  "void"
);

console.log("settlement result determination matrix passed");

// ---------- settleEvent end-to-end on memory mongo ----------

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());
await Promise.all([SportsBet.init(), LedgerEntry.init(), WalletAccount.init()]);

const user = await new User({
  username: "settletester",
  email: "settle@test.local",
  password: "Test@123456",
}).save();

const accounts = mapWalletAccountsByType(await ensureDefaultWalletAccounts(user._id));
const demoAccount = accounts.demo;
await WalletAccount.updateOne(
  { _id: demoAccount._id },
  { $set: { availableBalance: 1000 } }
);

const sportsEvent = await SportsEvent.create({
  provider: "simulated",
  providerEventId: "settle-e2e-1",
  sportKey: "cricket_ipl",
  sportGroup: "cricket",
  sportName: "Cricket",
  leagueName: "IPL",
  status: "live",
  startTime: new Date(),
  competitors: [
    { name: "Mumbai Indians", role: "home" },
    { name: "Chennai Super Kings", role: "away" },
  ],
  scoreboard: { home: 185, away: 170, completed: true },
});

const market = await Market.create({
  eventId: sportsEvent._id,
  provider: "simulated",
  providerMarketKey: "h2h",
  marketType: "h2h",
  title: "Match Winner",
  status: "open",
  selections: [
    { key: "mumbai_indians", name: "Mumbai Indians", status: "open" },
    { key: "chennai_super_kings", name: "Chennai Super Kings", status: "open" },
  ],
});

const totals = await Market.create({
  eventId: sportsEvent._id,
  provider: "simulated",
  providerMarketKey: "totals",
  marketType: "totals",
  title: "Totals",
  status: "open",
  selections: [
    { key: "over_355", name: "Over", line: 355, status: "open" },
    { key: "under_355", name: "Under", line: 355, status: "open" },
  ],
});

const makeBet = (marketDoc, selectionKey, selectionName, stake, price, line = null) =>
  SportsBet.create({
    userId: user._id,
    eventId: sportsEvent._id,
    marketId: marketDoc._id,
    walletAccountId: demoAccount._id,
    selectionKey,
    selectionName,
    selectionLine: line,
    stake,
    priceDecimal: price,
    potentialPayout: Number((stake * price).toFixed(2)),
  });

// Winner (home won 185-170), loser, and a push (total 355 === line 355) -> void
const winningBet = await makeBet(market, "mumbai_indians", "Mumbai Indians", 100, 1.9);
const losingBet = await makeBet(market, "chennai_super_kings", "Chennai Super Kings", 50, 2.1);
const voidBet = await makeBet(totals, "over_355", "Over", 75, 1.91, 355);

const summary = await settleEvent(sportsEvent._id, { actor: { type: "system" } });
assert.equal(summary.settledBets, 3);
assert.equal(summary.won, 1);
assert.equal(summary.lost, 1);
assert.equal(summary.void, 1);

// Balance: 1000 + 190 (win payout) + 75 (void refund) = 1265
const settledAccount = await WalletAccount.findById(demoAccount._id).lean();
assert.equal(settledAccount.availableBalance, 1265);

// Ledger categories
const settlementEntries = await LedgerEntry.find({
  referenceType: "SportsBet",
  direction: "credit",
}).lean();
assert.equal(settlementEntries.length, 2);
assert(
  settlementEntries.some(
    (entry) => entry.category === "sports_settlement" && entry.amount === 190
  )
);
assert(
  settlementEntries.some(
    (entry) => entry.category === "sports_refund" && entry.amount === 75
  )
);

// Bet statuses + event/market terminal states
assert.equal((await SportsBet.findById(winningBet._id)).status, "won");
assert.equal((await SportsBet.findById(losingBet._id)).status, "lost");
assert.equal((await SportsBet.findById(voidBet._id)).status, "void");
assert.equal((await SportsEvent.findById(sportsEvent._id)).status, "settled");
assert.equal((await Market.findById(market._id)).status, "settled");
console.log("settleEvent settles won/lost/void bets with correct ledger entries");

// Idempotency: a second run is a no-op and moves no money
const rerun = await settleEvent(sportsEvent._id, { actor: { type: "system" } });
assert.equal(rerun.skipped, true);
const balanceAfterRerun = await WalletAccount.findById(demoAccount._id).lean();
assert.equal(balanceAfterRerun.availableBalance, 1265);
assert.equal(
  await LedgerEntry.countDocuments({ referenceType: "SportsBet", direction: "credit" }),
  2
);
console.log("settleEvent re-run is an idempotent no-op");

await mongoose.disconnect();
await mongod.stop();
