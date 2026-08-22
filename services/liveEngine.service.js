export const LIVE_MIN_BET = 1;
export const LIVE_MAX_BET = 10000;
export const LIVE_FLOAT_COUNT = 2;

const ROULETTE_RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const SHOW_SEGMENTS = [
  { id: "miss", label: "Miss", multiplier: 0, weight: 50 },
  { id: "1x", label: "1x", multiplier: 1, weight: 22 },
  { id: "2x", label: "2x", multiplier: 2, weight: 12 },
  { id: "5x", label: "5x", multiplier: 5, weight: 5 },
  { id: "10x", label: "10x", multiplier: 10, weight: 2 },
];

const pickWeighted = (items, float) => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.min(0.999999, Math.max(0, Number(float) || 0)) * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor < 0) return item;
  }
  return items[items.length - 1];
};

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

const resolveRoulette = (floats, selection, bet) => {
  const pocket = Math.min(36, Math.floor((Number(floats[0]) || 0) * 37));
  const color = pocket === 0 ? "green" : ROULETTE_RED.has(pocket) ? "red" : "black";
  const even = pocket !== 0 && pocket % 2 === 0;
  const low = pocket >= 1 && pocket <= 18;
  const hits = {
    red: color === "red",
    black: color === "black",
    even: even,
    odd: pocket !== 0 && !even,
    low,
    high: pocket >= 19 && pocket <= 36,
  };
  const won = Boolean(hits[selection]);
  return {
    tableType: "roulette",
    result: { pocket, color },
    multiplier: won ? 2 : 0,
    payout: won ? roundMoney(bet * 2) : 0,
  };
};

const resolveBlackjack = (floats, bet) => {
  const player = 12 + Math.floor((Number(floats[0]) || 0) * 10);
  const dealer = 12 + Math.floor((Number(floats[1]) || 0) * 10);
  const playerBust = player > 21;
  const dealerBust = dealer > 21;
  const won = !playerBust && (dealerBust || player > dealer);
  const push = !playerBust && !dealerBust && player === dealer;
  const multiplier = won ? 2 : push ? 1 : 0;
  return {
    tableType: "blackjack",
    result: { player, dealer },
    multiplier,
    payout: roundMoney(bet * multiplier),
  };
};

const resolveBaccarat = (floats, selection, bet) => {
  const player = Math.floor((Number(floats[0]) || 0) * 10);
  const banker = Math.floor((Number(floats[1]) || 0) * 10);
  const winner = player === banker ? "tie" : player > banker ? "player" : "banker";
  const pays = { player: 2, banker: 1.95, tie: 8 };
  const won = selection === winner;
  const multiplier = won ? pays[selection] : 0;
  return {
    tableType: "baccarat",
    result: { player, banker, winner },
    multiplier,
    payout: won ? roundMoney(bet * multiplier) : 0,
  };
};

const resolveShow = (floats, bet) => {
  const segment = pickWeighted(SHOW_SEGMENTS, floats[0]);
  return {
    tableType: "show",
    result: { segment: segment.label, multiplier: segment.multiplier },
    multiplier: segment.multiplier,
    payout: roundMoney(bet * segment.multiplier),
  };
};

export const liveSelections = (tableType) => {
  if (tableType === "roulette") return ["red", "black", "even", "odd", "low", "high"];
  if (tableType === "baccarat") return ["player", "banker", "tie"];
  return [];
};

export const resolveLiveRound = ({ tableType, selection, floats, bet }) => {
  if (tableType === "blackjack") return resolveBlackjack(floats, bet);
  if (tableType === "baccarat") return resolveBaccarat(floats, selection, bet);
  if (tableType === "show") return resolveShow(floats, bet);
  return resolveRoulette(floats, selection, bet);
};
