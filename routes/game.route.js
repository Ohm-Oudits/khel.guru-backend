import express from "express";
import {
  createGame,
  deleteGame,
  findGame,
  findGames,
  getContinuedGames,
  getPopularGames,
  updateGame,
} from "../controllers/game.controllers.js";
import {
  getCurrentFairnessSeed,
  getFairnessOverview,
  getFairnessSeeds,
  rotateFairnessSeed,
  verifyFairness,
} from "../controllers/fairness.controller.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.post("/", createGame);
router.put("/update/:id", updateGame);
router.delete("/:id", deleteGame);
router.get("/", findGame);
router.get("/all", findGames);

router.get("/popular", getPopularGames);
router.get("/continue", verifyToken, getContinuedGames);
router.get("/fairness/overview", getFairnessOverview);
router.post("/fairness/verify", verifyFairness);
router.get("/fairness/seeds", verifyToken, getFairnessSeeds);
router.get("/fairness/current/:gameKey", verifyToken, getCurrentFairnessSeed);
router.post("/fairness/:gameKey/rotate", verifyToken, rotateFairnessSeed);

export default router;
