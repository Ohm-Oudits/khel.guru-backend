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
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.post("/", createGame);
router.put("/update/:id", updateGame);
router.delete("/:id", deleteGame);
router.get("/", findGame);
router.get("/all", findGames);

router.get("/popular", getPopularGames);
router.get("/continue", verifyToken, getContinuedGames);

export default router;
