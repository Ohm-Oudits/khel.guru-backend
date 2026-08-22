import ProviderGame from "../models/providerGame.model.js";
import {
  creditGameWin,
  debitGameStake,
} from "./casinoWallet.service.js";
import { consumeGameFloats } from "./fairnessConsume.service.js";
import {
  SLOT_FLOAT_COUNT,
  SLOT_MAX_BET,
  SLOT_MIN_BET,
  publicSlotConfig,
  resolveSlotSpin,
} from "./slotEngine.service.js";

export const toPublicSlot = (game) => ({
  slug: game.slug,
  name: game.name,
  provider: game.provider,
  studio: game.studio,
  category: game.category,
  img: game.img || `/games/slots/${game.slug}.png`,
  theme: game.theme,
  rtp: game.rtp,
  volatility: game.volatility,
  demoEnabled: game.demoEnabled,
  link: `/casino/slots/${game.slug}`,
  ...publicSlotConfig(game),
});

export const listSlots = async ({ provider } = {}) => {
  const query = { enabled: true, category: "slots" };
  if (provider) query.provider = provider;
  const games = await ProviderGame.find(query).sort({ name: 1 });
  return games.map(toPublicSlot);
};

export const getSlot = async (slug) => {
  const game = await ProviderGame.findOne({ slug, enabled: true });
  return game ? toPublicSlot(game) : null;
};

export const launchSlot = async (slug, { mode = "demo" } = {}) => {
  const game = await ProviderGame.findOne({ slug, enabled: true });
  if (!game) return null;

  const sessionId = `slot_${game.provider}_${game.slug}_${Date.now()}`;
  return {
    sessionId,
    mode: game.demoEnabled ? "demo" : mode,
    provider: game.provider,
    slug: game.slug,
    name: game.name,
    studio: game.studio,
    launchUrl: `/casino/slots/${game.slug}?session=${sessionId}`,
    embedUrl: null,
    engine: "house",
    playable: true,
  };
};

const parseBetAmount = (amount) => {
  const bet = Number(amount);
  if (!Number.isFinite(bet) || bet < SLOT_MIN_BET || bet > SLOT_MAX_BET) {
    return null;
  }
  return Math.round(bet * 100) / 100;
};

export const spinSlot = async (
  slug,
  { betAmount, walletType = "demo", userId = null } = {}
) => {
  const game = await ProviderGame.findOne({ slug, enabled: true });
  if (!game) return { error: "Slot not found", status: 404 };

  if (!userId) {
    return { error: "Login to play", status: 401 };
  }

  const bet = parseBetAmount(betAmount);
  if (bet == null) {
    return {
      error: `Bet must be between ${SLOT_MIN_BET} and ${SLOT_MAX_BET}`,
      status: 400,
    };
  }

  const debit = await debitGameStake(userId, {
    gameKey: "slots",
    amount: bet,
    walletType,
  });
  if (debit.error) return { error: debit.error, status: 400 };

  const fairness = await consumeGameFloats({
    userId,
    gameKey: "slots",
    count: SLOT_FLOAT_COUNT,
  });

  const outcome = resolveSlotSpin({
    slug: game.slug,
    volatility: game.volatility,
    floats: fairness.floats,
    bet,
  });

  const credit = await creditGameWin(userId, {
    gameKey: "slots",
    amount: outcome.payout,
    walletType,
  });

  return {
    spin: {
      slug: game.slug,
      name: game.name,
      theme: game.theme,
      bet,
      walletType,
      ...outcome,
      newBalance: credit.balance ?? debit.balance,
      nonce: fairness?.nonce ?? null,
      clientSeed: fairness?.clientSeed ?? null,
      serverSeedHash: fairness?.serverSeedHash ?? null,
    },
  };
};
