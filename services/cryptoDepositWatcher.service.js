import { JsonRpcProvider, formatEther } from "ethers";
import { Connection, PublicKey } from "@solana/web3.js";

import AuditLog from "../models/auditLog.model.js";
import CryptoDeposit from "../models/cryptoDeposit.model.js";
import CryptoDepositAddress from "../models/cryptoDepositAddress.model.js";
import CryptoWatcherState from "../models/cryptoWatcherState.model.js";
import Transaction from "../models/transaction.model.js";
import WalletAccount from "../models/walletAccount.model.js";
import { getRateToInr } from "./cryptoRates.service.js";
import {
  getActiveNetworks,
  registerCreditRoutine,
} from "./cryptoWallet.service.js";
import {
  createLedgerEntry,
  ensureDefaultWalletAccounts,
  mapWalletAccountsByType,
  normalizeAmount,
  syncLegacyBalance,
} from "./walletPlatform.service.js";

const MAX_ETH_BLOCKS_PER_TICK = 10;
const LAMPORTS_PER_SOL = 1_000_000_000;

const getEthConfirmations = () => {
  const configured = Number(process.env.ETH_CONFIRMATIONS);
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
};

const getWatchIntervalMs = () => {
  const configured = Number(process.env.CRYPTO_WATCH_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 1000 ? configured : 15000;
};

const getEthRpcUrl = (network) =>
  network === "mainnet"
    ? process.env.ETH_RPC_URL_MAINNET
    : process.env.ETH_RPC_URL_SEPOLIA ||
      "https://ethereum-sepolia-rpc.publicnode.com";

const getSolRpcUrl = (network) =>
  network === "mainnet"
    ? process.env.SOL_RPC_URL_MAINNET
    : process.env.SOL_RPC_URL_DEVNET || "https://api.devnet.solana.com";

const recordSystemAudit = async (action, entityId, metadata = {}) =>
  AuditLog.create({
    actorUserId: null,
    actorType: "system",
    action,
    entityType: "CryptoDeposit",
    entityId,
    severity: "info",
    metadata,
  });

const recordDeposit = async (payload) => {
  try {
    return await CryptoDeposit.create(payload);
  } catch (error) {
    if (error?.code === 11000) {
      // Already seen this transaction for this address — idempotent skip.
      return null;
    }
    throw error;
  }
};

// Exactly-once crediting: the claim CAS admits one caller; a crash between the
// claim and the finalize is repaired by recoverStuckCredits on startup.
export const creditConfirmedDeposit = async (depositId) => {
  const deposit = await CryptoDeposit.findOneAndUpdate(
    { _id: depositId, status: "confirmed" },
    { $set: { status: "crediting" } },
    { new: true }
  );

  if (!deposit) {
    return { skipped: true };
  }

  const fxRate = getRateToInr(deposit.chain);
  const creditedAmount = normalizeAmount(deposit.amountCrypto * fxRate);

  if (!creditedAmount) {
    await CryptoDeposit.updateOne(
      { _id: deposit._id },
      { $set: { status: "failed", metadata: { ...deposit.metadata, failReason: "zero_credit_amount" } } }
    );
    return { failed: true };
  }

  const accounts = await ensureDefaultWalletAccounts(deposit.userId);
  const cashAccount = mapWalletAccountsByType(accounts).cash;

  const updatedAccount = await WalletAccount.findOneAndUpdate(
    { _id: cashAccount._id },
    { $inc: { availableBalance: creditedAmount } },
    { new: true }
  );

  await syncLegacyBalance(deposit.userId, updatedAccount.availableBalance);

  const transaction = await Transaction.create({
    userId: deposit.userId,
    type: "deposit",
    amount: creditedAmount,
    status: "success",
    meta: {
      walletAccountId: updatedAccount._id,
      walletType: updatedAccount.walletType,
      method: "crypto",
      provider: deposit.chain,
      cryptoDepositId: deposit._id,
      txHash: deposit.txHash,
    },
  });

  const ledgerEntry = await createLedgerEntry({
    userId: deposit.userId,
    walletAccountId: updatedAccount._id,
    direction: "credit",
    category: "deposit",
    amount: creditedAmount,
    balanceAfter: updatedAccount.availableBalance,
    description: `Crypto deposit credited (${deposit.chain.toUpperCase()})`,
    referenceType: "crypto_deposit",
    referenceId: deposit._id,
    metadata: {
      chain: deposit.chain,
      network: deposit.network,
      txHash: deposit.txHash,
      amountCrypto: deposit.amountCrypto,
      fxRate,
    },
  });

  await CryptoDeposit.updateOne(
    { _id: deposit._id },
    {
      $set: {
        status: "credited",
        walletAccountId: updatedAccount._id,
        ledgerEntryId: ledgerEntry._id,
        fxRate,
        creditedAmount,
        creditedAt: new Date(),
      },
    }
  );

  await recordSystemAudit("crypto.deposit.credited", deposit._id, {
    userId: deposit.userId,
    creditedAmount,
    fxRate,
    transactionId: transaction._id,
    ledgerEntryId: ledgerEntry._id,
  });

  return { credited: true, creditedAmount };
};

// Startup repair for rows stuck in "crediting" after a crash: finalize if the
// ledger entry landed, otherwise reset to "confirmed" for a clean retry.
export const recoverStuckCredits = async () => {
  const LedgerEntry = (await import("../models/ledgerEntry.model.js")).default;
  const stuck = await CryptoDeposit.find({ status: "crediting" });

  for (const deposit of stuck) {
    const ledgerEntry = await LedgerEntry.findOne({
      referenceType: "crypto_deposit",
      referenceId: deposit._id,
    });

    if (ledgerEntry) {
      await CryptoDeposit.updateOne(
        { _id: deposit._id, status: "crediting" },
        {
          $set: {
            status: "credited",
            ledgerEntryId: ledgerEntry._id,
            walletAccountId: ledgerEntry.walletAccountId,
            fxRate: ledgerEntry.metadata?.fxRate ?? deposit.fxRate,
            creditedAmount: ledgerEntry.amount,
            creditedAt: ledgerEntry.createdAt,
          },
        }
      );
    } else {
      await CryptoDeposit.updateOne(
        { _id: deposit._id, status: "crediting" },
        { $set: { status: "confirmed" } }
      );
    }
  }

  return stuck.length;
};

const creditAllConfirmed = async (chain, network) => {
  const confirmed = await CryptoDeposit.find({
    status: "confirmed",
    chain,
    network,
  }).select("_id");

  for (const deposit of confirmed) {
    await creditConfirmedDeposit(deposit._id);
  }
};

const scanEthChain = async (network) => {
  const rpcUrl = getEthRpcUrl(network);
  if (!rpcUrl) return;

  const provider = new JsonRpcProvider(rpcUrl);
  const requiredConfirmations = getEthConfirmations();

  const addressRecords = await CryptoDepositAddress.find({
    chain: "eth",
    network,
    status: "active",
  });

  if (addressRecords.length === 0) return;

  const addressMap = new Map(
    addressRecords.map((record) => [record.address.toLowerCase(), record])
  );

  const head = await provider.getBlockNumber();
  const stateId = `eth:${network}`;
  let state = await CryptoWatcherState.findById(stateId);

  if (!state) {
    state = await CryptoWatcherState.create({ _id: stateId, lastBlock: head - 1 });
  }

  const fromBlock = (state.lastBlock ?? head - 1) + 1;
  const toBlock = Math.min(head, fromBlock + MAX_ETH_BLOCKS_PER_TICK - 1);

  for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += 1) {
    const block = await provider.getBlock(blockNumber, true);
    if (!block) {
      throw new Error(`ETH block ${blockNumber} unavailable`);
    }

    for (const tx of block.prefetchedTransactions || []) {
      const to = tx.to?.toLowerCase();
      if (!to || !addressMap.has(to) || tx.value <= 0n) continue;

      const record = addressMap.get(to);
      await recordDeposit({
        userId: record.userId,
        depositAddressId: record._id,
        chain: "eth",
        network,
        txHash: tx.hash,
        address: record.address,
        amountBaseUnits: tx.value.toString(),
        amountCrypto: Number(formatEther(tx.value)),
        requiredConfirmations,
        blockRef: blockNumber,
        status: "pending",
      });
    }
  }

  // Cursor advances only after every block in the range scanned successfully.
  await CryptoWatcherState.updateOne(
    { _id: stateId },
    { $set: { lastBlock: toBlock } }
  );

  // Promote pending deposits that have enough confirmations.
  const pending = await CryptoDeposit.find({
    status: "pending",
    chain: "eth",
    network,
  });

  for (const deposit of pending) {
    const confirmations =
      deposit.blockRef !== null ? head - deposit.blockRef + 1 : 0;

    if (confirmations >= deposit.requiredConfirmations) {
      await CryptoDeposit.updateOne(
        { _id: deposit._id, status: "pending" },
        { $set: { status: "confirmed", confirmations } }
      );
    } else if (confirmations !== deposit.confirmations) {
      await CryptoDeposit.updateOne(
        { _id: deposit._id },
        { $set: { confirmations } }
      );
    }
  }

  await creditAllConfirmed("eth", network);
};

const scanSolChain = async (network) => {
  const rpcUrl = getSolRpcUrl(network);
  if (!rpcUrl) return;

  const connection = new Connection(rpcUrl, "confirmed");

  const addressRecords = await CryptoDepositAddress.find({
    chain: "sol",
    network,
    status: "active",
  });

  for (const record of addressRecords) {
    const pubkey = new PublicKey(record.address);
    const lastSeenSig = record.metadata?.lastSeenSig || undefined;

    const signatures = await connection.getSignaturesForAddress(pubkey, {
      until: lastSeenSig,
      limit: 25,
    });

    // Oldest first so lastSeenSig only advances past fully processed entries.
    for (const signatureInfo of signatures.reverse()) {
      if (signatureInfo.err) continue;

      const parsed = await connection.getParsedTransaction(
        signatureInfo.signature,
        { maxSupportedTransactionVersion: 0 }
      );
      if (!parsed) continue;

      const accountKeys = parsed.transaction.message.accountKeys;
      const accountIndex = accountKeys.findIndex(
        (key) => key.pubkey.toBase58() === record.address
      );
      if (accountIndex < 0) continue;

      const delta =
        (parsed.meta?.postBalances?.[accountIndex] ?? 0) -
        (parsed.meta?.preBalances?.[accountIndex] ?? 0);

      if (delta > 0) {
        await recordDeposit({
          userId: record.userId,
          depositAddressId: record._id,
          chain: "sol",
          network,
          txHash: signatureInfo.signature,
          address: record.address,
          amountBaseUnits: String(delta),
          amountCrypto: delta / LAMPORTS_PER_SOL,
          requiredConfirmations: 1, // finalized commitment, not a count
          blockRef: signatureInfo.slot,
          status: "pending",
        });
      }

      await CryptoDepositAddress.updateOne(
        { _id: record._id },
        { $set: { "metadata.lastSeenSig": signatureInfo.signature } }
      );
    }
  }

  // Pending SOL deposits confirm once their signature reaches finality.
  const pending = await CryptoDeposit.find({
    status: "pending",
    chain: "sol",
    network,
  });

  if (pending.length > 0) {
    const statuses = await connection.getSignatureStatuses(
      pending.map((deposit) => deposit.txHash),
      { searchTransactionHistory: true }
    );

    for (let i = 0; i < pending.length; i += 1) {
      const status = statuses?.value?.[i];
      if (status?.confirmationStatus === "finalized") {
        await CryptoDeposit.updateOne(
          { _id: pending[i]._id, status: "pending" },
          { $set: { status: "confirmed", confirmations: 1 } }
        );
      }
    }
  }

  await creditAllConfirmed("sol", network);
};

const intervals = [];
const inFlight = { eth: false, sol: false };

const runGuarded = async (chain, fn) => {
  if (inFlight[chain]) return;
  inFlight[chain] = true;
  try {
    await fn();
  } catch (error) {
    console.error(`Crypto watcher ${chain} tick failed:`, error.message);
  } finally {
    inFlight[chain] = false;
  }
};

export const startCryptoDepositWatcher = async () => {
  if (process.env.CRYPTO_DEPOSITS_ENABLED !== "true") {
    return false;
  }

  registerCreditRoutine(creditConfirmedDeposit);

  const recovered = await recoverStuckCredits();
  if (recovered > 0) {
    console.log(`Crypto watcher recovered ${recovered} stuck credit(s)`);
  }

  const networks = getActiveNetworks();
  const intervalMs = getWatchIntervalMs();

  intervals.push(
    setInterval(() => runGuarded("eth", () => scanEthChain(networks.eth)), intervalMs),
    setInterval(() => runGuarded("sol", () => scanSolChain(networks.sol)), intervalMs)
  );

  console.log(
    `Crypto deposit watcher started (eth:${networks.eth}, sol:${networks.sol}, every ${intervalMs}ms)`
  );
  return true;
};

export const stopCryptoDepositWatcher = () => {
  while (intervals.length > 0) {
    clearInterval(intervals.pop());
  }
};
