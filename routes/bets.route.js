import express from "express";
import {
  getBetById,
  getBetHistory,
  placeSingleBet,
  settleBet,
} from "../controllers/bets.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { requireRole } from "../middleware/requireRole.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.use(verifyToken);

router.post("/single", apiLimiter, placeSingleBet);
router.get("/history", apiLimiter, getBetHistory);
router.get("/:betId", apiLimiter, getBetById);
router.post(
  "/:betId/settle",
  apiLimiter,
  requireRole("admin", "support"),
  settleBet
);

export default router;
