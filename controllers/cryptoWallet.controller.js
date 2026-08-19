import crypto from "crypto";

import CryptoDeposit from "../models/cryptoDeposit.model.js";
import { creditConfirmedDeposit } from "../services/cryptoDepositWatcher.service.js";
import {
  getActiveNetworks,
  getOrCreateDepositAddresses,
  serializeDepositAddress,
} from "../services/cryptoWallet.service.js";

const serializeDeposit = (deposit) => ({
  id: deposit._id,
  chain: deposit.chain,
  network: deposit.network,
  txHash: deposit.txHash,
  address: deposit.address,
  amountCrypto: deposit.amountCrypto,
  fxRate: deposit.fxRate,
  creditedCurrency: deposit.creditedCurrency,
  creditedAmount: deposit.creditedAmount,
  confirmations: deposit.confirmations,
  requiredConfirmations: deposit.requiredConfirmations,
  status: deposit.status,
  creditedAt: deposit.creditedAt,
  createdAt: deposit.createdAt,
});

export const getCryptoDepositAddresses = async (req, res, next) => {
  try {
    const { profile, addresses } = await getOrCreateDepositAddresses(
      req.user._id
    );

    res.json({
      accountUid: profile.accountUid,
      addresses: addresses.map(serializeDepositAddress),
    });
  } catch (err) {
    next(err);
  }
};

// Dev-only: fabricates a confirmed deposit and pushes it through the exact
// production crediting path so the cashier is demo-able without faucets.
export const simulateCryptoDeposit = async (req, res, next) => {
  try {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.CRYPTO_ALLOW_SIMULATED_DEPOSITS !== "true"
    ) {
      return res.status(404).json({ error: "Not found" });
    }

    const chain = req.body.chain === "sol" ? "sol" : "eth";
    const amountCrypto = Number(req.body.amountCrypto);

    if (!Number.isFinite(amountCrypto) || amountCrypto <= 0) {
      return res.status(400).json({ error: "Invalid amountCrypto" });
    }

    const { addresses } = await getOrCreateDepositAddresses(req.user._id);
    const network = getActiveNetworks()[chain];
    const addressRecord = addresses.find(
      (entry) => entry.chain === chain && entry.network === network
    );

    const baseUnitsPerCoin = chain === "eth" ? 1e18 : 1e9;
    const deposit = await CryptoDeposit.create({
      userId: req.user._id,
      depositAddressId: addressRecord._id,
      chain,
      network,
      txHash: `sim_${crypto.randomBytes(16).toString("hex")}`,
      address: addressRecord.address,
      amountBaseUnits: BigInt(
        Math.round(amountCrypto * baseUnitsPerCoin)
      ).toString(),
      amountCrypto,
      requiredConfirmations: 1,
      confirmations: 1,
      status: "confirmed",
      metadata: { simulated: true },
    });

    await creditConfirmedDeposit(deposit._id);
    const credited = await CryptoDeposit.findById(deposit._id);

    res.status(201).json({
      message: "Simulated deposit credited",
      deposit: {
        id: credited._id,
        chain: credited.chain,
        network: credited.network,
        txHash: credited.txHash,
        amountCrypto: credited.amountCrypto,
        creditedAmount: credited.creditedAmount,
        status: credited.status,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listMyCryptoDeposits = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const filters = { userId: req.user._id };

    if (req.query.status) {
      filters.status = String(req.query.status).trim();
    }

    const deposits = await CryptoDeposit.find(filters)
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      count: deposits.length,
      deposits: deposits.map(serializeDeposit),
    });
  } catch (err) {
    next(err);
  }
};
