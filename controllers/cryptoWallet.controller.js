import CryptoDeposit from "../models/cryptoDeposit.model.js";
import {
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
