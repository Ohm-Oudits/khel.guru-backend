import Balance from "../models/balance.model.js";
import LedgerEntry from "../models/ledgerEntry.model.js";
import WalletAccount from "../models/walletAccount.model.js";

const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || "INR";

const DEFAULT_WALLET_ACCOUNTS = [
  { walletType: "cash", label: "Cash Wallet" },
  { walletType: "vault", label: "Vault" },
  { walletType: "demo", label: "Demo Wallet" },
];

export const normalizeAmount = (amount) => {
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return null;
  }

  return Number(parsedAmount.toFixed(2));
};

export const serializeWalletAccount = (account) => ({
  id: account._id,
  walletType: account.walletType,
  label: account.label,
  currency: account.currency,
  availableBalance: account.availableBalance,
  lockedBalance: account.lockedBalance,
  status: account.status,
});

export const ensureDefaultWalletAccounts = async (userId) => {
  const accounts = await Promise.all(
    DEFAULT_WALLET_ACCOUNTS.map((account) =>
      WalletAccount.findOneAndUpdate(
        {
          userId,
          walletType: account.walletType,
          currency: DEFAULT_CURRENCY,
        },
        {
          $setOnInsert: {
            userId,
            walletType: account.walletType,
            currency: DEFAULT_CURRENCY,
            label: account.label,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
    )
  );

  return accounts;
};

export const mapWalletAccountsByType = (accounts) =>
  accounts.reduce((result, account) => {
    result[account.walletType] = account;
    return result;
  }, {});

export const syncLegacyBalance = async (userId, balance) => {
  await Balance.findOneAndUpdate(
    { userId },
    { $set: { balance } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

export const createLedgerEntry = async ({
  userId,
  walletAccountId,
  direction,
  category,
  amount,
  balanceAfter,
  description,
  referenceType = null,
  referenceId = null,
  metadata = {},
}) =>
  LedgerEntry.create({
    userId,
    walletAccountId,
    direction,
    category,
    amount,
    balanceAfter,
    description,
    referenceType,
    referenceId,
    metadata,
  });

export const buildWalletOverview = async (userId) => {
  const accounts = await ensureDefaultWalletAccounts(userId);
  const accountsByType = mapWalletAccountsByType(accounts);

  return {
    currency: DEFAULT_CURRENCY,
    accounts: accounts.map(serializeWalletAccount),
    totals: {
      available: accounts.reduce(
        (sum, account) => sum + account.availableBalance,
        0
      ),
      locked: accounts.reduce((sum, account) => sum + account.lockedBalance, 0),
    },
    cashBalance: accountsByType.cash?.availableBalance || 0,
    vaultBalance: accountsByType.vault?.availableBalance || 0,
    demoBalance: accountsByType.demo?.availableBalance || 0,
  };
};
