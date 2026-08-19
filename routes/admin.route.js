import express from "express";
import {
  getAdminOverview,
  getAdminQueues,
} from "../controllers/admin.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { requireRole } from "../middleware/requireRole.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("admin", "support"));
router.get("/overview", apiLimiter, getAdminOverview);
router.get("/queues", apiLimiter, getAdminQueues);

export default router;
