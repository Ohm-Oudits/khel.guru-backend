import express from "express";
import {
  createSport,
  deleteSport,
  findSport,
  findSports,
  updateSport,
} from "../controllers/sport.controller.js";
import {
  getProviderSportsCatalog,
  getSportsbookCatalog,
  getSportsbookEvent,
  getSportsbookEventMarkets,
  getSportsbookEvents,
  getSportsbookProviders,
  ingestSportsbookFeed,
} from "../controllers/sportsbook.controller.js";
import { requireRole } from "../middleware/requireRole.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.get("/catalog", getSportsbookCatalog);
router.get("/providers", getSportsbookProviders);
router.get(
  "/providers/:provider/sports",
  verifyToken,
  requireRole("admin", "support"),
  getProviderSportsCatalog
);
router.get("/events", getSportsbookEvents);
router.get("/events/:eventId", getSportsbookEvent);
router.get("/events/:eventId/markets", getSportsbookEventMarkets);
router.post(
  "/ingest",
  verifyToken,
  requireRole("admin", "support"),
  ingestSportsbookFeed
);

router.post("/", createSport);
router.put("/update/:id", updateSport);
router.delete("/:id", deleteSport);
router.get("/", findSport);
router.get("/all", findSports);

export default router;
