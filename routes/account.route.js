import express from "express";
import {
  createSelfExclusion,
  getAccountOverview,
  getKycProfile,
  getResponsibleGamingProfile,
  getSelfExclusions,
  updateKycProfile,
  updateResponsibleGamingLimits,
} from "../controllers/account.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.use(verifyToken);
router.get("/overview", apiLimiter, getAccountOverview);
router.route("/kyc").get(apiLimiter, getKycProfile).put(apiLimiter, updateKycProfile);
router.get("/responsible-gaming", apiLimiter, getResponsibleGamingProfile);
router.put(
  "/responsible-gaming/limits",
  apiLimiter,
  updateResponsibleGamingLimits
);
router
  .route("/self-exclusions")
  .get(apiLimiter, getSelfExclusions)
  .post(apiLimiter, createSelfExclusion);

export default router;
