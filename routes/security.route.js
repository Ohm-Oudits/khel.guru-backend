import express from "express";
import {
  getSecurityOverview,
  getSessions,
  revokeSession,
} from "../controllers/security.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.use(verifyToken);
router.get("/overview", apiLimiter, getSecurityOverview);
router.get("/sessions", apiLimiter, getSessions);
router.post("/sessions/:sessionId/revoke", apiLimiter, revokeSession);

export default router;
