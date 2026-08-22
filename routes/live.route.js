import express from "express";
import {
  getCasinoLive,
  launchCasinoLive,
  listCasinoLive,
  playCasinoLive,
} from "../controllers/live.controller.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.get("/", listCasinoLive);
router.get("/:slug", getCasinoLive);
router.post("/:slug/launch", launchCasinoLive);
router.post("/:slug/play", verifyToken, playCasinoLive);

export default router;
