import WalletAccount from "../models/walletAccount.model.js";
import {
  createLedgerEntry,
  ensureDefaultWalletAccounts,
  mapWalletAccountsByType,
  normalizeAmount,
  syncLegacyBalance,
} from "./walletPlatform.service.js";

// Shared wallet plumbing for the casino originals. Every stake debit and
// winnings credit goes through here so games move real balance via guarded
// atomic updates (never load-modify-save) and every movement is ledgered.
//
// Games are demo-first: the default wallet is "demo". Passing walletType
// "cash" bets real cash balance. Unknown types fall back to demo.

const ALLOWED_WALLET_TYPES = new Set(["demo", "cash"]);

export const resolveGameWalletType = (walletType) =>
  ALLOWED_WALLET_TYPES.has(walletType) ? walletType : "demo";

const getAccount = async (userId, walletType) => {
  const accounts = await ensureDefaultWalletAccounts(userId);
  return mapWalletAccountsByType(accounts)[resolveGameWalletType(walletType)];
};

// Atomic stake debit with a balance-floor guard. Returns { account } on
// success or { error } when the balance is insufficient / amount invalid.
export const debitGameStake = async (userId, { gameKey, amount, walletType = "demo" }) => {
  let stake;
  try {
    stake = normalizeAmount(amount);
  } catch {
    return { error: "Invalid bet amount" };
  }

  const account = await getAccount(userId, walletType);
  if (!account) return { error: "Wallet account not available" };

  const updated = await WalletAccount.findOneAndUpdate(
    { _id: account._id, status: "active", availableBalance: { $gte: stake } },
    { $inc: { availableBalance: -stake } },
    { new: true }
  );
  if (!updated) return { error: "Insufficient balance" };

  if (updated.walletType === "cash") {
    await syncLegacyBalance(userId, updated.availableBalance);
  }

  await createLedgerEntry({
    userId,
    walletAccountId: updated._id,
    direction: "debit",
    category: "casino_bet",
    amount: stake,
    balanceAfter: updated.availableBalance,
    description: `${gameKey} bet`,
    referenceType: "CasinoRound",
    metadata: { gameKey, walletType: updated.walletType },
  });

  return { account: updated, stake, balance: updated.availableBalance };
};

// Atomic winnings credit. amount is the total payout returned to the player
// (stake + profit for a win). A zero/omitted amount is a no-op (a loss).
export const creditGameWin = async (userId, { gameKey, amount, walletType = "demo", category = "casino_win" }) => {
  let payout;
  try {
    payout = normalizeAmount(amount);
  } catch {
    return { balance: null };
  }
  if (payout <= 0) {
    const account = await getAccount(userId, walletType);
    return { balance: account ? account.availableBalance : null };
  }

  const account = await getAccount(userId, walletType);
  if (!account) return { balance: null };

  const updated = await WalletAccount.findOneAndUpdate(
    { _id: account._id, status: "active" },
    { $inc: { availableBalance: payout } },
    { new: true }
  );

  if (updated.walletType === "cash") {
    await syncLegacyBalance(userId, updated.availableBalance);
  }

  await createLedgerEntry({
    userId,
    walletAccountId: updated._id,
    direction: "credit",
    category,
    amount: payout,
    balanceAfter: updated.availableBalance,
    description: `${gameKey} payout`,
    referenceType: "CasinoRound",
    metadata: { gameKey, walletType: updated.walletType },
  });

  return { account: updated, balance: updated.availableBalance };
};

// Refund a stake (e.g. a push/void). Same as a credit under the refund category.
export const refundGameStake = async (userId, opts) =>
  creditGameWin(userId, { ...opts, category: "casino_refund" });

// Current balance for the game's wallet, for surfacing in results.
export const getGameBalance = async (userId, walletType = "demo") => {
  const account = await getAccount(userId, walletType);
  return account ? account.availableBalance : null;
};
