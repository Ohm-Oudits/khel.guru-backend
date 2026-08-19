import express from "express";
import {
  getActiveSelfExclusions,
  getAdminOverview,
  getAdminQueues,
  getKycReviewQueue,
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

export default router;
