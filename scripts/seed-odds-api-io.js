import dotenv from "dotenv";
import mongoose from "mongoose";

import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import { ODDS_API_IO_SPORT_SLUGS } from "../services/sportsbookCatalog.service.js";
import { ingestNormalizedSportsbookFeed } from "../services/sportsbookIngest.service.js";
import { recordUsage } from "../services/providerUsage.service.js";
import { fetchOddsApiIoFeed } from "../services/sportsbookProviders/oddsApiIoProvider.js";

dotenv.config();

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required to seed odds-api.io");
}

if (!process.env.ODDS_API_IO_KEY) {
  console.log("odds-api.io seed skipped: ODDS_API_IO_KEY is not set");
  process.exit(0);
}

await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([Market.init(), OddsSnapshot.init(), SportsEvent.init()]);

const seedSports = ODDS_API_IO_SPORT_SLUGS.slice(
  0,
  Number.parseInt(process.env.SPORTSBOOK_ODDS_IO_SEED_SPORTS || "4", 10) || 4
);

try {
  const { items, usage } = await fetchOddsApiIoFeed({
    includeLive: false,
    includeUpcoming: true,
    includeSettled: true,
    sports: seedSports,
    maxOddsEvents: 0,
    skipTestLookup: true,
    pendingLimit: 80,
  });
  await recordUsage("odds-api-io", usage);
  const ingested = await ingestNormalizedSportsbookFeed(items);
  const live = items.filter((item) => item.status === "live").length;
  const upcoming = items.filter((item) => item.status === "upcoming").length;
  const completed = items.filter((item) => item.completed).length;
  const withMarkets = items.filter((item) => item.markets?.length).length;
  console.log(
    `odds-api.io seeded: ${ingested.events.length} events (live=${live} upcoming=${upcoming} completed24h=${completed} priced=${withMarkets}) sports=${seedSports.join(",")} remaining=${usage?.remaining ?? "?"}`
  );
} catch (error) {
  console.warn(`odds-api.io seed skipped: ${error.message}`);
}

await mongoose.disconnect();
