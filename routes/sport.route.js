import express from "express";
import {
  createSport,
  deleteSport,
  findSport,
  updateSport,
} from "../controllers/sport.controller.js";

const router = express.Router();

router.post("/", createSport);
router.put("/update/:id", updateSport);
router.delete("/:id", deleteSport);
router.get("/", findSport);

export default router;
