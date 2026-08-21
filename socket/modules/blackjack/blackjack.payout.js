export const BLACKJACK_RTP = 0.9943;
export const BLACKJACK_HOUSE_EDGE = 0.0057;

/** Total return multipliers (stake included). Profit is multiplier − 1. */
export const BJ_WIN_RETURN = 2; // 1:1
export const BJ_NATURAL_RETURN = 2.5; // 3:2
export const BJ_PUSH_RETURN = 1;
export const BJ_LOSE_RETURN = 0;
/** Insurance stake is typically half the main bet; 2:1 profit → 3× that side stake. */
export const BJ_INSURANCE_WIN_RETURN = 3;

export const TEN_VALUES = new Set(["10", "J", "Q", "K"]);

export const isTenValue = (value) => TEN_VALUES.has(String(value));

export const isAce = (value) => String(value) === "A";

export const isNaturalBlackjack = (cards = []) => {
  if (!Array.isArray(cards) || cards.length !== 2) return false;
  const values = cards.map((card) => card.value);
  return values.some(isAce) && values.some(isTenValue);
};

export const dealerShowsAce = (dealerCards = []) => isAce(dealerCards[0]?.value);

export const dealerShowsTen = (dealerCards = []) =>
  isTenValue(dealerCards[0]?.value);

export const compareHands = (playerValue, dealerValue) => {
  if (playerValue > 21) return "lose";
  if (dealerValue > 21) return "win";
  if (playerValue > dealerValue) return "win";
  if (playerValue < dealerValue) return "lose";
  return "draw";
};

/**
 * Stake Originals: natural Ace+10 on the first two cards of a non-split hand
 * pays 3:2. A 21 after hitting, doubling, or splitting pays 1:1.
 */
export const settleMainHand = ({
  stake,
  result,
  playerNatural = false,
  splitHand = false,
}) => {
  const amount = Number(stake) || 0;
  if (result === "lose") {
    return { result: "lose", multiplier: BJ_LOSE_RETURN, totalReturn: 0 };
  }
  if (result === "draw") {
    return {
      result: "draw",
      multiplier: BJ_PUSH_RETURN,
      totalReturn: amount,
    };
  }
  if (result === "blackjack" || (result === "win" && playerNatural && !splitHand)) {
    return {
      result: "blackjack",
      multiplier: BJ_NATURAL_RETURN,
      totalReturn: amount * BJ_NATURAL_RETURN,
    };
  }
  return {
    result: "win",
    multiplier: BJ_WIN_RETURN,
    totalReturn: amount * BJ_WIN_RETURN,
  };
};

export const settleInsurance = ({ insuranceStake, dealerNatural }) => {
  const amount = Number(insuranceStake) || 0;
  if (amount <= 0) {
    return { result: null, totalReturn: 0 };
  }
  if (dealerNatural) {
    return {
      result: "win",
      totalReturn: amount * BJ_INSURANCE_WIN_RETURN,
    };
  }
  return { result: "lose", totalReturn: 0 };
};

export const BLACKJACK_PAYOUT_FORMULAS = {
  win: "bet × 2.00 (1:1)",
  blackjack: "bet × 2.50 (3:2 natural)",
  push: "bet × 1.00 (stake returned)",
  lose: "0",
  insurance: "insuranceStake × 3.00 (2:1)",
  double: "doubled stake uses the same 1:1 / push / lose table",
  split: "each hand is a separate 1:1 bet; split 21 is not a 3:2 natural",
  rtp: "99.43% RTP / 0.57% house edge from dealer S17 + 3:2 naturals, not 0.9943/P(win)",
};
