import ProviderUsage from "../models/providerUsage.model.js";

const DEFAULT_BUDGET = 500;
const DEFAULT_RESERVE = 50;

export const currentPeriod = (now = new Date()) =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

export const getUsage = async (provider) =>
  ProviderUsage.findOneAndUpdate(
    { provider, period: currentPeriod() },
    { $setOnInsert: { creditsUsed: 0, requestCount: 0 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

export const recordUsage = async (provider, { cost, used, remaining } = {}) => {
  const update = {
    $inc: {
      creditsUsed: Number.isFinite(cost) ? cost : 0,
      requestCount: 1,
    },
    $set: { lastRequestAt: new Date() },
  };

  if (Number.isFinite(used)) {
    update.$set.usedReported = used;
  }
  if (Number.isFinite(remaining)) {
    update.$set.remainingReported = remaining;
  }
  if (Number.isFinite(cost)) {
    update.$set.lastRequestCost = cost;
  }

  return ProviderUsage.findOneAndUpdate(
    { provider, period: currentPeriod() },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

// Pure so budget rules unit-test without a database. The provider's own
// x-requests-used header is ground truth when it exceeds the local counter.
export const evaluateBudget = ({
  usage,
  estimatedCost = 1,
  budget = DEFAULT_BUDGET,
  reserve = DEFAULT_RESERVE,
  purpose = "odds",
}) => {
  const localUsed = usage?.creditsUsed || 0;
  const reportedUsed = Number.isFinite(usage?.usedReported)
    ? usage.usedReported
    : 0;
  const effectiveUsed = Math.max(localUsed, reportedUsed);
  const remaining = Number.isFinite(usage?.remainingReported)
    ? usage.remainingReported
    : null;

  // The provider's remaining header is ground truth. A high used-count
  // from earlier in the month must not block leftover credits.
  if (remaining !== null) {
    const allowed = remaining >= estimatedCost;
    return {
      allowed,
      effectiveUsed,
      ceiling: remaining,
      remainingReported: remaining,
      reason: allowed ? "within-budget" : "provider-credits-exhausted",
    };
  }

  // Settlement of already-accepted bets must never starve: scores calls may
  // spend into the reserve, everything else stops at budget - reserve.
  const ceiling = purpose === "scores" ? budget : budget - reserve;
  const allowed = effectiveUsed + estimatedCost <= ceiling;

  return {
    allowed,
    effectiveUsed,
    ceiling,
    remainingReported: remaining,
    reason: allowed
      ? "within-budget"
      : purpose === "scores"
        ? "monthly-budget-exhausted"
        : "budget-reserve-reached",
  };
};

export const canSpend = async (provider, { estimatedCost = 1, purpose = "odds" } = {}) => {
  const usage = await getUsage(provider);

  return evaluateBudget({
    usage,
    estimatedCost,
    purpose,
    budget: Number(process.env.THE_ODDS_API_MONTHLY_BUDGET || DEFAULT_BUDGET),
    reserve: Number(process.env.THE_ODDS_API_RESERVE_CREDITS || DEFAULT_RESERVE),
  });
};
