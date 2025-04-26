import express from "express";
import {
  createGame,
  deleteGame,
  findGame,
  updateGame,
} from "../controllers/game.controllers.js";

const router = express.Router();

router.post("/", createGame);
router.put("/update/:id", updateGame);
router.delete("/:id", deleteGame);
router.get("/", findGame);

export default router;
