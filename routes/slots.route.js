import express from "express";
import {
  getCasinoSlot,
  launchCasinoSlot,
  listCasinoSlots,
  sandboxWalletBalance,
  sandboxWalletNoop,
  spinCasinoSlot,
} from "../controllers/slots.controller.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.get("/", listCasinoSlots);
router.post("/wallet/balance", sandboxWalletBalance);
router.post("/wallet/bet", sandboxWalletNoop);
router.post("/wallet/win", sandboxWalletNoop);
router.post("/wallet/rollback", sandboxWalletNoop);
router.get("/:slug", getCasinoSlot);
router.post("/:slug/launch", launchCasinoSlot);
router.post("/:slug/spin", verifyToken, spinCasinoSlot);

export default router;
