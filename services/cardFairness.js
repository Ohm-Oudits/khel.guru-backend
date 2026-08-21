export const CARD_SUITS = ["♦", "♥", "♠", "♣"];
export const CARD_RANKS = [
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
  "A",
];

/** Stake order: index 0 = ♦2 … index 51 = ♣A. */
export const STAKE_CARDS = CARD_RANKS.flatMap((rank) =>
  CARD_SUITS.map((suit) => ({
    rank,
    suit,
    value: rank,
    label: `${suit}${rank}`,
  }))
);

export const HILO_BLACKJACK_EVENT_COUNT = 52;
export const BACCARAT_EVENT_COUNT = 6;

export const CARD_FAIRNESS_FORMULA =
  "HMAC_SHA256(serverSeed, clientSeed:nonce:round) → float → CARDS[floor(float × 52)] (unlimited decks)";

export const cardIndexFromFloat = (float) => {
  const x = Number(float);
  const value = Number.isFinite(x) ? Math.min(Math.max(x, 0), 0.999999999999) : 0;
  return Math.min(51, Math.floor(value * 52));
};

export const cardFromFloat = (float) => {
  const index = cardIndexFromFloat(float);
  return { ...STAKE_CARDS[index], index };
};

export const cardsFromFloats = (floats = []) => floats.map(cardFromFloat);

export const toHiloCard = (card) => ({
  value: card.value,
  suit: card.suit,
  color: card.suit === "♦" || card.suit === "♥",
});

export const toBlackjackCard = (card, dealIndex) => ({
  suit: card.suit,
  value: card.value,
  id: `${card.suit}-${card.value}-${dealIndex}`,
  flipped: true,
});

export const toBaccaratCard = (card) => ({
  suit: card.suit,
  value: card.value,
});

export const buildCardFairnessPayload = (
  { gameKey, nonce, clientSeed, serverSeedHash, serverSeed, dealIndex },
  { revealServerSeed = false, extra = {} } = {}
) => ({
  gameKey,
  nonce,
  clientSeed,
  serverSeedHash,
  dealIndex,
  ...(revealServerSeed && serverSeed ? { serverSeed } : {}),
  ...extra,
});
