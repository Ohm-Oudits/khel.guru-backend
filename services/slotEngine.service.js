import crypto from "node:crypto";

export const SLOT_REELS = 5;
export const SLOT_ROWS = 3;
export const SLOT_FLOAT_COUNT = 5;
export const SLOT_MIN_BET = 1;
export const SLOT_MAX_BET = 10000;

export const SYMBOL_IDS = [
  "wild",
  "seven",
  "bar",
  "bell",
  "gem",
  "fruit",
  "coin",
  "ace",
];

export const PAYTABLE = {
  wild: { 3: 38, 4: 150, 5: 600 },
  seven: { 3: 18, 4: 60, 5: 185 },
  bar: { 3: 13, 4: 38, 5: 105 },
  bell: { 3: 10, 4: 27, 5: 68 },
  gem: { 3: 8, 4: 18, 5: 45 },
  fruit: { 3: 6, 4: 14, 5: 30 },
  coin: { 3: 5, 4: 11, 5: 22 },
  ace: { 3: 4, 4: 8, 5: 15 },
};

export const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];

const VOLATILITY_WEIGHTS = {
  low: { ace: 4, coin: 5, fruit: 5, gem: 4, bell: 3, bar: 3, seven: 2, wild: 3 },
  medium: {
    ace: 5,
    coin: 5,
    fruit: 4,
    gem: 4,
    bell: 3,
    bar: 3,
    seven: 2,
    wild: 3,
  },
  high: { ace: 6, coin: 5, fruit: 4, gem: 3, bell: 3, bar: 2, seven: 2, wild: 3 },
};

const DEFAULT_THEME = {
  wild: { glyph: "★", label: "Wild" },
  seven: { glyph: "7", label: "Seven" },
  bar: { glyph: "▬", label: "Bar" },
  bell: { glyph: "🔔", label: "Bell" },
  gem: { glyph: "💎", label: "Gem" },
  fruit: { glyph: "🍒", label: "Fruit" },
  coin: { glyph: "🪙", label: "Coin" },
  ace: { glyph: "A", label: "Ace" },
};

const SLOT_THEMES = {
  "neon-tiger": {
    wild: { glyph: "🐯", label: "Tiger" },
    seven: { glyph: "⚡", label: "Bolt" },
    bar: { glyph: "🌆", label: "City" },
    bell: { glyph: "💎", label: "Crystal" },
    gem: { glyph: "🔮", label: "Orb" },
    fruit: { glyph: "🧡", label: "Flame" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "✦", label: "Spark" },
  },
  "mango-rush": {
    wild: { glyph: "🥭", label: "Mango" },
    seven: { glyph: "🌟", label: "Star" },
    bar: { glyph: "🌴", label: "Palm" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🟡", label: "Sun" },
    fruit: { glyph: "🍑", label: "Peach" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "☀️", label: "Heat" },
  },
  "lotus-reels": {
    wild: { glyph: "🪷", label: "Lotus" },
    seven: { glyph: "👑", label: "Crown" },
    bar: { glyph: "🏯", label: "Temple" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "💜", label: "Petal" },
    fruit: { glyph: "🌸", label: "Blossom" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "✨", label: "Glow" },
  },
  "royal-dhol": {
    wild: { glyph: "🥁", label: "Dhol" },
    seven: { glyph: "👑", label: "Royal" },
    bar: { glyph: "🎺", label: "Fanfare" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🔴", label: "Ruby" },
    fruit: { glyph: "🌹", label: "Rose" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "♠", label: "Ace" },
  },
  "temple-gold": {
    wild: { glyph: "🛕", label: "Temple" },
    seven: { glyph: "🥇", label: "Gold" },
    bar: { glyph: "📿", label: "Mala" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🔶", label: "Amber" },
    fruit: { glyph: "🍋", label: "Citrus" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "ॐ", label: "Om" },
  },
  "monsoon-gems": {
    wild: { glyph: "🌧️", label: "Rain" },
    seven: { glyph: "💧", label: "Drop" },
    bar: { glyph: "🌊", label: "Wave" },
    bell: { glyph: "🎐", label: "Chime" },
    gem: { glyph: "💠", label: "Aqua" },
    fruit: { glyph: "🫐", label: "Berry" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "☁️", label: "Cloud" },
  },
  "spice-fire": {
    wild: { glyph: "🌶️", label: "Chili" },
    seven: { glyph: "🔥", label: "Fire" },
    bar: { glyph: "🪵", label: "Wood" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🟠", label: "Ember" },
    fruit: { glyph: "🍅", label: "Tomato" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "✦", label: "Spark" },
  },
  "peacock-ways": {
    wild: { glyph: "🦚", label: "Peacock" },
    seven: { glyph: "🪶", label: "Plume" },
    bar: { glyph: "💚", label: "Jade" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🟢", label: "Emerald" },
    fruit: { glyph: "🍇", label: "Grape" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "✦", label: "Spark" },
  },
  "desert-coins": {
    wild: { glyph: "🐪", label: "Camel" },
    seven: { glyph: "🏺", label: "Urn" },
    bar: { glyph: "🏜️", label: "Dune" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🟡", label: "Sand" },
    fruit: { glyph: "🌵", label: "Cactus" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "☀️", label: "Sun" },
  },
  "night-bazaar": {
    wild: { glyph: "🏮", label: "Lantern" },
    seven: { glyph: "🌙", label: "Moon" },
    bar: { glyph: "🛍️", label: "Stall" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🟣", label: "Violet" },
    fruit: { glyph: "🍇", label: "Grape" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "✦", label: "Spark" },
  },
  "jade-drums": {
    wild: { glyph: "🥁", label: "Drum" },
    seven: { glyph: "🟢", label: "Jade" },
    bar: { glyph: "🎋", label: "Bamboo" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🟩", label: "Jade" },
    fruit: { glyph: "🍐", label: "Pear" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "✦", label: "Spark" },
  },
  "star-samosa": {
    wild: { glyph: "🥟", label: "Samosa" },
    seven: { glyph: "⭐", label: "Star" },
    bar: { glyph: "🌙", label: "Night" },
    bell: { glyph: "🔔", label: "Bell" },
    gem: { glyph: "🟠", label: "Masala" },
    fruit: { glyph: "🧅", label: "Onion" },
    coin: { glyph: "🪙", label: "Coin" },
    ace: { glyph: "✦", label: "Spark" },
  },
};

const stripCache = new Map();

const shuffleInPlace = (items, seed) => {
  let state = seed >>> 0;
  for (let i = items.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

export const normalizeVolatility = (volatility) => {
  const key = String(volatility || "medium").toLowerCase();
  if (key === "low" || key === "high") return key;
  return "medium";
};

export const getReelStrips = (volatility = "medium") => {
  const level = normalizeVolatility(volatility);
  if (stripCache.has(level)) return stripCache.get(level);

  const weights = VOLATILITY_WEIGHTS[level];
  const strips = Array.from({ length: SLOT_REELS }, (_, reel) => {
    const strip = [];
    for (const [symbol, count] of Object.entries(weights)) {
      for (let i = 0; i < count; i += 1) strip.push(symbol);
    }
    return shuffleInPlace(strip, 4801 + reel * 97 + level.length * 13);
  });

  stripCache.set(level, strips);
  return strips;
};

export const themeForSlug = (slug) => SLOT_THEMES[slug] || DEFAULT_THEME;

export const symbolCatalog = (slug) =>
  SYMBOL_IDS.map((id) => ({
    id,
    glyph: themeForSlug(slug)[id].glyph,
    label: themeForSlug(slug)[id].label,
  }));

export const decorateCell = (symbolId, slug) => {
  const theme = themeForSlug(slug)[symbolId] || DEFAULT_THEME[symbolId];
  return {
    id: symbolId,
    glyph: theme.glyph,
    label: theme.label,
  };
};

export const evaluateLine = (symbols) => {
  if (!symbols.length) return null;
  const paying =
    symbols[0] === "wild"
      ? symbols.find((symbol) => symbol !== "wild") || "wild"
      : symbols[0];

  let count = 0;
  for (const symbol of symbols) {
    if (symbol === paying || symbol === "wild") count += 1;
    else break;
  }

  const multiplier = PAYTABLE[paying]?.[count] || 0;
  if (count < 3 || !multiplier) return null;
  return { symbol: paying, count, multiplier };
};

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

export const resolveSlotSpin = ({
  slug,
  volatility = "medium",
  floats,
  bet,
}) => {
  const strips = getReelStrips(volatility);
  const stops = Array.from({ length: SLOT_REELS }, (_, reel) => {
    const float = Number(floats?.[reel]);
    const safe = Number.isFinite(float) && float >= 0 ? float % 1 : 0;
    return Math.min(strips[reel].length - 1, Math.floor(safe * strips[reel].length));
  });

  const gridIds = Array.from({ length: SLOT_ROWS }, (_, row) =>
    stops.map((stop, reel) => {
      const strip = strips[reel];
      return strip[(stop + row) % strip.length];
    })
  );

  const lineStake = Number(bet) / PAYLINES.length;
  const wins = [];
  let totalMultiplier = 0;

  PAYLINES.forEach((rows, line) => {
    const symbols = rows.map((row, reel) => gridIds[row][reel]);
    const hit = evaluateLine(symbols);
    if (!hit) return;
    wins.push({
      line,
      ...hit,
      payout: roundMoney(hit.multiplier * lineStake),
      cells: rows.map((row, reel) => [row, reel]),
    });
    totalMultiplier += hit.multiplier;
  });

  const payout = roundMoney(wins.reduce((sum, win) => sum + win.payout, 0));
  const stake = roundMoney(bet);

  return {
    reels: SLOT_REELS,
    rows: SLOT_ROWS,
    stops,
    grid: gridIds.map((row) => row.map((id) => decorateCell(id, slug))),
    wins,
    multiplier: roundMoney(totalMultiplier / PAYLINES.length),
    payout,
    profit: roundMoney(payout - stake),
  };
};

export const randomSlotFloats = (count = SLOT_FLOAT_COUNT) =>
  Array.from({ length: count }, () => crypto.randomBytes(4).readUInt32BE(0) / 2 ** 32);

export const publicSlotConfig = (game) => ({
  engine: "house",
  playable: true,
  reels: SLOT_REELS,
  rows: SLOT_ROWS,
  paylineCount: PAYLINES.length,
  minBet: SLOT_MIN_BET,
  maxBet: SLOT_MAX_BET,
  symbols: symbolCatalog(game.slug),
  paytable: PAYTABLE,
  icon: themeForSlug(game.slug).wild.glyph,
});

export const estimateSlotRtp = ({
  volatility = "medium",
  spins = 20000,
  bet = 10,
} = {}) => {
  let returned = 0;
  let staked = 0;
  for (let i = 0; i < spins; i += 1) {
    const outcome = resolveSlotSpin({
      slug: "neon-tiger",
      volatility,
      floats: randomSlotFloats(),
      bet,
    });
    returned += outcome.payout;
    staked += bet;
  }
  return returned / staked;
};
