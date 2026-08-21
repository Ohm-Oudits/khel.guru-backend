const CARD_VALUES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

/** Stake HiLo: 99% RTP applied on every successful pick (`0.99 / P`). */
export const HILO_RTP = 0.99;

const toOdds = (chance) => ({
  chance,
  percent: Number((chance * 100).toFixed(2)),
  multiplier: Number((HILO_RTP / chance).toFixed(4)),
});

export const getHiloOdds = (value) => {
  const index = CARD_VALUES.indexOf(value);
  const ranks = CARD_VALUES.length;
  if (index < 0) {
    return {
      high: { chance: 0, percent: 0, multiplier: 1 },
      low: { chance: 0, percent: 0, multiplier: 1 },
    };
  }
  const rank = index + 1;
  return {
    high: toOdds((14 - rank) / ranks),
    low: toOdds(rank / ranks),
  };
};

export const countSuccessfulPicks = (historyCards = []) =>
  historyCards.filter(
    (card) => card?.result === "high-true" || card?.result === "low-true"
  ).length;

export const pickFactor = (chance) => {
  if (!(chance > 0)) return 0;
  return HILO_RTP / chance;
};

export const applyPickMultiplier = (current, factor) =>
  Number((Number(current) * Number(factor)).toFixed(8));

export default {
  HILO_RTP,
  getHiloOdds,
  countSuccessfulPicks,
  pickFactor,
  applyPickMultiplier,
};
