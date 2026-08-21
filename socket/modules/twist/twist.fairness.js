import { TWIST_OUTCOME_TABLE } from "./twist.constants.js";

export const deriveTwistOutcome = (float) => {
  const x = Number(float);
  const value = Number.isFinite(x) ? Math.min(Math.max(x, 0), 0.999999999999) : 0;
  const row =
    TWIST_OUTCOME_TABLE.find((entry) => value < entry.max) ||
    TWIST_OUTCOME_TABLE[TWIST_OUTCOME_TABLE.length - 1];
  return row.outcome;
};
