import { SLIDE_RTP } from "../../../services/provablyFair.service.js";

export const SLIDE_MIN_TARGET = 1.01;
export const SLIDE_MAX_TARGET = 100000;

export const parseSlideTarget = (value) => {
  const target = Number(value);
  if (!Number.isFinite(target) || target < SLIDE_MIN_TARGET) return null;
  return Math.min(SLIDE_MAX_TARGET, Math.round(target * 100) / 100);
};

/** P(result ≥ X) = 0.98 / X, as a percent. */
export const slideWinChancePercent = (targetMultiplier) => {
  const target = Number(targetMultiplier);
  if (!Number.isFinite(target) || target < SLIDE_MIN_TARGET) return 0;
  return (SLIDE_RTP / target) * 100;
};

/**
 * Stake Slide: win only if the generated result reaches the player's target.
 * Credit is stake × target (not stake × generated result).
 */
export const settleSlideBet = ({
  betAmount,
  targetMultiplier,
  resultMultiplier,
}) => {
  const stake = Number(betAmount);
  const target = Number(targetMultiplier);
  const result = Number(resultMultiplier);
  const isWin =
    Number.isFinite(result) && Number.isFinite(target) && result >= target;
  const payout =
    isWin && Number.isFinite(stake) && stake > 0 ? stake * target : 0;
  return {
    isWin,
    payout,
    profit: payout - (Number.isFinite(stake) && stake > 0 ? stake : 0),
    target,
    result,
  };
};
