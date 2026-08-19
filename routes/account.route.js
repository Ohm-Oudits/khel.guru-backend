import express from "express";
import { getAccountOverview } from "../controllers/account.controller.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.use(verifyToken);
router.get("/overview", apiLimiter, getAccountOverview);

export default router;
