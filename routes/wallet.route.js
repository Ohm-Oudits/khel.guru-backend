import express from "express";
import {
  getBalance,
  deposit,
  withdraw,
  getTransactions,
} from "../controllers/wallet.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

router.get("/balance", apiLimiter, getBalance);
router.post("/deposit", apiLimiter, deposit);
router.post("/withdraw", apiLimiter, withdraw);
router.get("/transactions", apiLimiter, getTransactions);

export default router;
