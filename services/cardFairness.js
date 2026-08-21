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

export const cardLabel = (card) => {
  if (!card || card.hidden || card.value === "hidden" || !card.suit) {
    return null;
  }
  return `${card.suit}${card.value}`;
};

const shoeIndexFromBlackjackId = (id) => {
  const match = String(id || "").match(/-(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : null;
};

export const hiloDealtFromHistory = (historyCards = []) =>
  (historyCards || [])
    .map((card, index) => {
      const label = cardLabel(card);
      return label ? { index, label } : null;
    })
    .filter(Boolean);

export const blackjackDealtFromState = (game = {}) => {
  const cards = [];
  if (game.isSplit && Array.isArray(game.splitHands)) {
    for (const hand of game.splitHands) {
      cards.push(...(hand || []));
    }
  } else {
    cards.push(...(game.userCards || []));
  }
  cards.push(...(game.dealerCards || []));

  return cards
    .map((card) => {
      const label = cardLabel(card);
      if (!label) return null;
      return { index: shoeIndexFromBlackjackId(card.id), label };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.index == null && b.index == null) return 0;
      if (a.index == null) return 1;
      if (b.index == null) return -1;
      return a.index - b.index;
    });
};

/** HMAC order is player 2, banker 2, then extras in the order they were drawn. */
export const baccaratDealtFromHands = (playerCards = [], bankerCards = []) => {
  const ordered = [
    playerCards[0],
    playerCards[1],
    bankerCards[0],
    bankerCards[1],
  ];
  if (playerCards[2]) ordered.push(playerCards[2]);
  if (bankerCards[2]) ordered.push(bankerCards[2]);
  return ordered
    .map((card, index) => {
      const label = cardLabel(card);
      return label ? { index, label } : null;
    })
    .filter(Boolean);
};

export const buildCardFairnessPayload = (
  {
    gameKey,
    nonce,
    clientSeed,
    serverSeedHash,
    serverSeed,
    dealIndex,
    dealt = [],
  },
  { revealServerSeed = false, extra = {} } = {}
) => ({
  gameKey,
  nonce,
  clientSeed,
  serverSeedHash,
  dealIndex,
  dealt,
  formula: CARD_FAIRNESS_FORMULA,
  ...(revealServerSeed && serverSeed ? { serverSeed } : {}),
  ...extra,
});
