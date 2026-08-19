import express from "express";
import {
  approvePayoutRequest,
  claimPayoutRequest,
  getActiveSelfExclusions,
  getAdminOverview,
  getAdminQueues,
  getKycReviewQueue,
  getPayoutQueue,
  listAllCryptoDeposits,
  recheckCryptoDeposit,
  rejectPayoutRequest,
  reviewKycProfile,
} from "../controllers/admin.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { requireRole } from "../middleware/requireRole.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("admin", "support"));
router.get("/overview", apiLimiter, getAdminOverview);
router.get("/queues", apiLimiter, getAdminQueues);
router.get("/kyc/queue", apiLimiter, getKycReviewQueue);
router.post("/kyc/:userId/review", apiLimiter, reviewKycProfile);
router.get("/self-exclusions", apiLimiter, getActiveSelfExclusions);
router.get("/crypto/deposits", apiLimiter, listAllCryptoDeposits);
router.post("/crypto/deposits/:depositId/recheck", apiLimiter, recheckCryptoDeposit);
router.get("/payouts/queue", apiLimiter, getPayoutQueue);
router.post("/payouts/:payoutId/claim", apiLimiter, claimPayoutRequest);
router.post("/payouts/:payoutId/approve", apiLimiter, requireRole("admin"), approvePayoutRequest);
router.post("/payouts/:payoutId/reject", apiLimiter, requireRole("admin"), rejectPayoutRequest);

export default router;
