import express from "express";
import {
  createSport,
  deleteSport,
  findSport,
  findSports,
  updateSport,
} from "../controllers/sport.controller.js";

const router = express.Router();

router.post("/", createSport);
router.put("/update/:id", updateSport);
router.delete("/:id", deleteSport);
router.get("/", findSport);
router.get("/all", findSports);

export default router;
