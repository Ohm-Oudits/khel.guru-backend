import ProviderGame from "../models/providerGame.model.js";
import { SANDBOX_LIVE } from "../scripts/seed-live.js";
import {
  creditGameWin,
  debitGameStake,
} from "./casinoWallet.service.js";
import { consumeGameFloats } from "./fairnessConsume.service.js";
import {
  LIVE_FLOAT_COUNT,
  LIVE_MAX_BET,
  LIVE_MIN_BET,
  liveSelections,
  resolveLiveRound,
} from "./liveEngine.service.js";

const iconFor = (slug) =>
  SANDBOX_LIVE.find((table) => table.slug === slug)?.icon || "🔴";

const tableTypeOf = (game) =>
  game.tableType ||
  SANDBOX_LIVE.find((table) => table.slug === game.slug)?.tableType ||
  "roulette";

export const toPublicLive = (game) => ({
  slug: game.slug,
  name: game.name,
  provider: game.provider,
  studio: game.studio,
  category: "live",
  img: game.img || `/games/live/${game.slug}.png`,
  theme: game.theme,
  tableType: tableTypeOf(game),
  selections: liveSelections(tableTypeOf(game)),
  demoEnabled: game.demoEnabled,
  link: `/casino/live/${game.slug}`,
  engine: "live-studio",
  playable: true,
  icon: iconFor(game.slug),
});

export const listLive = async () => {
  const games = await ProviderGame.find({
    enabled: true,
    category: "live",
  }).sort({ name: 1 });
  return games.map(toPublicLive);
};

export const getLiveTable = async (slug) => {
  const game = await ProviderGame.findOne({
    slug,
    enabled: true,
    category: "live",
  });
  return game ? toPublicLive(game) : null;
};

export const launchLive = async (slug, { mode = "demo" } = {}) => {
  const game = await ProviderGame.findOne({
    slug,
    enabled: true,
    category: "live",
  });
  if (!game) return null;

  const sessionId = `live_${game.provider}_${game.slug}_${Date.now()}`;
  return {
    sessionId,
    mode: game.demoEnabled ? "demo" : mode,
    provider: game.provider,
    slug: game.slug,
    name: game.name,
    studio: game.studio,
    tableType: tableTypeOf(game),
    launchUrl: `/casino/live/${game.slug}?session=${sessionId}`,
    embedUrl: null,
    engine: "live-studio",
    playable: true,
  };
};

const parseBetAmount = (amount) => {
  const bet = Number(amount);
  if (!Number.isFinite(bet) || bet < LIVE_MIN_BET || bet > LIVE_MAX_BET) {
    return null;
  }
  return Math.round(bet * 100) / 100;
};

export const playLive = async (
  slug,
  { betAmount, selection, walletType = "demo", userId = null } = {}
) => {
  if (!userId) return { error: "Login to play", status: 401 };

  const game = await ProviderGame.findOne({
    slug,
    enabled: true,
    category: "live",
  });
  if (!game) return { error: "Live table not found", status: 404 };

  const bet = parseBetAmount(betAmount);
  if (bet == null) {
    return {
      error: `Bet must be between ${LIVE_MIN_BET} and ${LIVE_MAX_BET}`,
      status: 400,
    };
  }

  const tableType = tableTypeOf(game);
  const allowed = liveSelections(tableType);
  const pick = String(selection || "").toLowerCase();
  if (allowed.length && !allowed.includes(pick)) {
    return { error: "Choose a valid live bet", status: 400 };
  }

  const debit = await debitGameStake(userId, {
    gameKey: "live",
    amount: bet,
    walletType,
  });
  if (debit.error) return { error: debit.error, status: 400 };

  const fairness = await consumeGameFloats({
    userId,
    gameKey: "live",
    count: LIVE_FLOAT_COUNT,
  });
  const outcome = resolveLiveRound({
    tableType,
    selection: pick,
    floats: fairness.floats,
    bet,
  });
  const credit = await creditGameWin(userId, {
    gameKey: "live",
    amount: outcome.payout,
    walletType,
  });

  return {
    round: {
      slug: game.slug,
      name: game.name,
      theme: game.theme,
      tableType,
      selection: pick || null,
      bet,
      walletType,
      ...outcome,
      profit: Math.round((outcome.payout - bet) * 100) / 100,
      newBalance: credit.balance ?? debit.balance,
      nonce: fairness.nonce,
      clientSeed: fairness.clientSeed,
      serverSeedHash: fairness.serverSeedHash,
    },
  };
};
