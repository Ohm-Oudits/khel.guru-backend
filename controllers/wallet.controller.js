import AuditLog from "../models/auditLog.model.js";
import LedgerEntry from "../models/ledgerEntry.model.js";
import Transaction from "../models/transaction.model.js";
import {
  buildWalletOverview,
  createLedgerEntry,
  ensureDefaultWalletAccounts,
  mapWalletAccountsByType,
  normalizeAmount,
  serializeWalletAccount,
  syncLegacyBalance,
} from "../services/walletPlatform.service.js";

const createAuditLog = async (req, action, entityId, metadata = {}) =>
  AuditLog.create({
    actorUserId: req.user._id,
    actorType: "user",
    action,
    entityType: "Wallet",
    entityId,
    severity: "info",
    ipAddress: req.ip,
    userAgent: req.get("User-Agent") || null,
    metadata,
  });

const getAccountsByType = async (userId) => {
  const accounts = await ensureDefaultWalletAccounts(userId);
  return mapWalletAccountsByType(accounts);
};

export const getBalance = async (req, res, next) => {
  try {
    const overview = await buildWalletOverview(req.user._id);
    await syncLegacyBalance(req.user._id, overview.cashBalance);

    res.json({
      balance: overview.cashBalance,
      ...overview,
    });
  } catch (err) {
    next(err);
  }
};

export const getWalletAccounts = async (req, res, next) => {
  try {
    const overview = await buildWalletOverview(req.user._id);

    res.json(overview);
  } catch (err) {
    next(err);
  }
};

export const deposit = async (req, res, next) => {
  try {
    const amount = normalizeAmount(req.body.amount);

    if (!amount) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const accountsByType = await getAccountsByType(req.user._id);
    const cashAccount = accountsByType.cash;

    cashAccount.availableBalance += amount;
    await cashAccount.save();
    await syncLegacyBalance(req.user._id, cashAccount.availableBalance);

    const transaction = await Transaction.create({
      userId: req.user._id,
      type: "deposit",
      amount,
      status: "success",
      meta: {
        walletAccountId: cashAccount._id,
        walletType: cashAccount.walletType,
      },
    });

    const ledgerEntry = await createLedgerEntry({
      userId: req.user._id,
      walletAccountId: cashAccount._id,
      direction: "credit",
      category: "deposit",
      amount,
      balanceAfter: cashAccount.availableBalance,
      description: "Cash deposit credited to cash wallet",
      referenceType: "Transaction",
      referenceId: transaction._id,
    });

    await createAuditLog(req, "wallet.deposit.created", cashAccount._id, {
      amount,
      transactionId: transaction._id,
      ledgerEntryId: ledgerEntry._id,
    });

    res.json({
      balance: cashAccount.availableBalance,
      account: serializeWalletAccount(cashAccount),
      transactionId: transaction._id,
      ledgerEntryId: ledgerEntry._id,
    });
  } catch (err) {
    next(err);
  }
};

export const withdraw = async (req, res, next) => {
  try {
    const amount = normalizeAmount(req.body.amount);

    if (!amount) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const accountsByType = await getAccountsByType(req.user._id);
    const cashAccount = accountsByType.cash;

    if (cashAccount.availableBalance < amount) {
      await Transaction.create({
        userId: req.user._id,
        type: "withdraw",
        amount,
        status: "failed",
        meta: {
          reason: "insufficient_balance",
          walletAccountId: cashAccount._id,
        },
      });

      return res.status(400).json({ error: "Insufficient balance" });
    }

    cashAccount.availableBalance -= amount;
    await cashAccount.save();
    await syncLegacyBalance(req.user._id, cashAccount.availableBalance);

    const transaction = await Transaction.create({
      userId: req.user._id,
      type: "withdraw",
      amount,
      status: "success",
      meta: {
        walletAccountId: cashAccount._id,
        walletType: cashAccount.walletType,
      },
    });

    const ledgerEntry = await createLedgerEntry({
      userId: req.user._id,
      walletAccountId: cashAccount._id,
      direction: "debit",
      category: "withdrawal",
      amount,
      balanceAfter: cashAccount.availableBalance,
      description: "Cash withdrawal debited from cash wallet",
      referenceType: "Transaction",
      referenceId: transaction._id,
    });

    await createAuditLog(req, "wallet.withdrawal.created", cashAccount._id, {
      amount,
      transactionId: transaction._id,
      ledgerEntryId: ledgerEntry._id,
    });

    res.json({
      balance: cashAccount.availableBalance,
      account: serializeWalletAccount(cashAccount),
      transactionId: transaction._id,
      ledgerEntryId: ledgerEntry._id,
    });
  } catch (err) {
    next(err);
  }
};

export const transferVaultFunds = async (req, res, next) => {
  try {
    const amount = normalizeAmount(req.body.amount);
    const direction = req.body.direction === "from-vault" ? "from-vault" : "to-vault";

    if (!amount) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const accountsByType = await getAccountsByType(req.user._id);
    const fromAccount =
      direction === "to-vault" ? accountsByType.cash : accountsByType.vault;
    const toAccount =
      direction === "to-vault" ? accountsByType.vault : accountsByType.cash;

    if (fromAccount.availableBalance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    fromAccount.availableBalance -= amount;
    toAccount.availableBalance += amount;

    await fromAccount.save();
    await toAccount.save();
    await syncLegacyBalance(req.user._id, accountsByType.cash.availableBalance);

    const debitEntry = await createLedgerEntry({
      userId: req.user._id,
      walletAccountId: fromAccount._id,
      direction: "debit",
      category: "vault_transfer",
      amount,
      balanceAfter: fromAccount.availableBalance,
      description: `Funds moved ${direction === "to-vault" ? "into" : "out of"} vault`,
      metadata: { direction },
    });

    const creditEntry = await createLedgerEntry({
      userId: req.user._id,
      walletAccountId: toAccount._id,
      direction: "credit",
      category: "vault_transfer",
      amount,
      balanceAfter: toAccount.availableBalance,
      description: `Funds moved ${direction === "to-vault" ? "into" : "out of"} vault`,
      metadata: { direction },
    });

    await createAuditLog(req, "wallet.vault.transfer", toAccount._id, {
      amount,
      direction,
      debitEntryId: debitEntry._id,
      creditEntryId: creditEntry._id,
    });

    res.json({
      message: "Vault transfer completed successfully",
      accounts: [
        serializeWalletAccount(accountsByType.cash),
        serializeWalletAccount(accountsByType.vault),
      ],
      balance: accountsByType.cash.availableBalance,
    });
  } catch (err) {
    next(err);
  }
};

export const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const [transactions, ledgerEntries] = await Promise.all([
      Transaction.find({ userId }).sort({ createdAt: -1 }),
      LedgerEntry.find({ userId }).sort({ createdAt: -1 }).limit(50),
    ]);

    res.json({ transactions, ledgerEntries });
  } catch (err) {
    next(err);
  }
};

export const getWalletLedger = async (req, res, next) => {
  try {
    const ledgerEntries = await LedgerEntry.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    res.json({ ledgerEntries });
  } catch (err) {
    next(err);
  }
};
