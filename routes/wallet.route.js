import express from "express";
import {
  getBalance,
  deposit,
  withdraw,
  getTransactions,
  getWalletAccounts,
  getWalletLedger,
  topUpDemoBalance,
  transferVaultFunds,
} from "../controllers/wallet.controller.js";
import {
  getCryptoDepositAddresses,
  listMyCryptoDeposits,
  simulateCryptoDeposit,
} from "../controllers/cryptoWallet.controller.js";
import {
  createDepositIntent,
  getDepositIntent,
  listDepositIntents,
  simulateDepositIntent,
} from "../controllers/cashier.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

router.get("/balance", apiLimiter, getBalance);
router.get("/crypto/addresses", apiLimiter, getCryptoDepositAddresses);
router.get("/crypto/deposits", apiLimiter, listMyCryptoDeposits);
router.post("/crypto/deposits/simulate", apiLimiter, simulateCryptoDeposit);
router.get("/accounts", apiLimiter, getWalletAccounts);
router.get("/ledger", apiLimiter, getWalletLedger);
router.post("/deposit", apiLimiter, deposit);
router.post("/deposit-intents", apiLimiter, createDepositIntent);
router.get("/deposit-intents", apiLimiter, listDepositIntents);
router.get("/deposit-intents/:intentId", apiLimiter, getDepositIntent);
router.post("/deposit-intents/:intentId/simulate", apiLimiter, simulateDepositIntent);
router.post("/demo/top-up", apiLimiter, topUpDemoBalance);
router.post("/withdraw", apiLimiter, withdraw);
router.post("/vault/transfer", apiLimiter, transferVaultFunds);
router.get("/transactions", apiLimiter, getTransactions);

export default router;
