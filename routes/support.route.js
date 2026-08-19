import express from "express";
import {
  createSupportTicket,
  getSupportOverview,
  getSupportTickets,
} from "../controllers/support.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.use(verifyToken);
router.get("/overview", apiLimiter, getSupportOverview);
router
  .route("/tickets")
  .get(apiLimiter, getSupportTickets)
  .post(apiLimiter, createSupportTicket);

export default router;
