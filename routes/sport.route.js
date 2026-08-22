import express from "express";
import {
  getProviderSportsCatalog,
  getSportsbookCatalog,
  getSportsbookEvent,
  getSportsbookEventMarkets,
  getSportsbookEvents,
  getSportsbookProviders,
  getParticipantLogo,
  getSportsbookUsage,
  ingestSportsbookFeed,
} from "../controllers/sportsbook.controller.js";
import { requireRole } from "../middleware/requireRole.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.get("/catalog", getSportsbookCatalog);
router.get("/participants/:participantId/logo", getParticipantLogo);
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
router.get(
  "/usage",
  verifyToken,
  requireRole("admin", "support"),
  getSportsbookUsage
);

export default router;
