import assert from "node:assert/strict";

import { evaluateBudget, currentPeriod } from "../services/providerUsage.service.js";

assert.match(currentPeriod(new Date("2026-08-20T10:00:00Z")), /^2026-08$/);

// Under budget: allowed.
assert.equal(
  evaluateBudget({
    usage: { creditsUsed: 100, usedReported: null },
    estimatedCost: 2,
    budget: 500,
    reserve: 50,
    purpose: "odds",
  }).allowed,
  true
);

// Odds polls stop at budget - reserve.
const atReserve = evaluateBudget({
  usage: { creditsUsed: 449, usedReported: null },
  estimatedCost: 2,
  budget: 500,
  reserve: 50,
  purpose: "odds",
});
assert.equal(atReserve.allowed, false);
assert.equal(atReserve.reason, "budget-reserve-reached");

// Scores calls may spend into the reserve...
assert.equal(
  evaluateBudget({
    usage: { creditsUsed: 470, usedReported: null },
    estimatedCost: 2,
    budget: 500,
    reserve: 50,
    purpose: "scores",
  }).allowed,
  true
);

// ...but never past the full monthly budget.
assert.equal(
  evaluateBudget({
    usage: { creditsUsed: 499, usedReported: null },
    estimatedCost: 2,
    budget: 500,
    reserve: 50,
    purpose: "scores",
  }).allowed,
  false
);

// Provider-reported usage overrides a stale local counter.
const headerOverride = evaluateBudget({
  usage: { creditsUsed: 10, usedReported: 460 },
  estimatedCost: 2,
  budget: 500,
  reserve: 50,
  purpose: "odds",
});
assert.equal(headerOverride.allowed, false);
assert.equal(headerOverride.effectiveUsed, 460);

// Leftover provider credits still allow live odds, even if used > local ceiling.
const leftover = evaluateBudget({
  usage: { creditsUsed: 12, usedReported: 480, remainingReported: 18 },
  estimatedCost: 2,
  budget: 500,
  reserve: 50,
  purpose: "odds",
});
assert.equal(leftover.allowed, true);

assert.equal(
  evaluateBudget({
    usage: { creditsUsed: 12, usedReported: 500, remainingReported: 0 },
    estimatedCost: 2,
    budget: 500,
    reserve: 50,
    purpose: "odds",
  }).reason,
  "provider-credits-exhausted"
);

console.log("Sportsbook budget guard test passed");
