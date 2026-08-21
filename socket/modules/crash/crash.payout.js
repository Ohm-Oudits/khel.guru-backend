import { CRASH_RTP } from "../../../services/provablyFair.service.js";

export const CRASH_MIN_CASHOUT = 1.01;

/** P(crash point ≥ X) = rtp / X, as a percent. */
export const crashReachChancePercent = (targetMultiplier, rtp = CRASH_RTP) => {
  const target = Number(targetMultiplier);
  const edge = Number(rtp);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(edge)) return 0;
  return (edge / target) * 100;
};

export const parseCrashAutoTarget = (value) => {
  const target = Number(value);
  if (!Number.isFinite(target) || target < CRASH_MIN_CASHOUT) return null;
  return Math.round(target * 100) / 100;
};

/** Cashout credits stake × the cashed multiplier (not the crash point). */
export const crashCashoutPayout = (stake, multiplier) => {
  const amount = Number(stake);
  const x = Number(multiplier);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(x) || x < 1) {
    return 0;
  }
  return amount * x;
};
