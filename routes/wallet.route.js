import express from "express";
import {
  getBalance,
  deposit,
  withdraw,
  getTransactions,
  getWalletAccounts,
  getWalletLedger,
  transferVaultFunds,
} from "../controllers/wallet.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

router.get("/balance", apiLimiter, getBalance);
router.get("/accounts", apiLimiter, getWalletAccounts);
router.get("/ledger", apiLimiter, getWalletLedger);
router.post("/deposit", apiLimiter, deposit);
router.post("/withdraw", apiLimiter, withdraw);
router.post("/vault/transfer", apiLimiter, transferVaultFunds);
router.get("/transactions", apiLimiter, getTransactions);

export default router;
