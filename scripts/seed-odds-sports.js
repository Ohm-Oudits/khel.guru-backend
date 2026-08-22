import dotenv from "dotenv";
import mongoose from "mongoose";

import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import { SPORTSBOOK_CATALOG } from "../services/sportsbookCatalog.service.js";
import { ingestNormalizedSportsbookFeed } from "../services/sportsbookIngest.service.js";
import { recordUsage } from "../services/providerUsage.service.js";
import { fetchTheOddsApiOdds } from "../services/sportsbookProviders/theOddsApiProvider.js";
import {
  listInSeasonOddsSportKeys,
  matchCatalogHintKeys,
} from "../services/sportsbookSportKeys.js";

dotenv.config();

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is required to seed Odds API sports");
}

if (!process.env.THE_ODDS_API_KEY) {
  console.log("Odds API sports seed skipped: THE_ODDS_API_KEY is not set");
  process.exit(0);
}

await mongoose.connect(mongoUri);
await Promise.all([Market.init(), OddsSnapshot.init(), SportsEvent.init()]);

let inSeason = [];
try {
  inSeason = await listInSeasonOddsSportKeys();
} catch (error) {
  console.warn(`Odds API sports list skipped: ${error.message}`);
  await mongoose.disconnect();
  process.exit(0);
}

let items = [];
const usedKeys = [];

for (const sport of SPORTSBOOK_CATALOG) {
  if (sport.sportKey === "cricket") continue;

  const keys = matchCatalogHintKeys(sport.providerHints, inSeason);
  if (!keys.length) {
    console.log(`Odds API ${sport.sportKey}: no in-season catalog leagues`);
    continue;
  }

  for (const sportKey of keys) {
    try {
      const result = await fetchTheOddsApiOdds({ sportKey });
      await recordUsage("the-odds-api", result.usage);
      items = items.concat(result.items || []);
      usedKeys.push(sportKey);
      console.log(
        `Odds API ${sportKey}: ${result.items?.length || 0} events remaining=${result.usage?.remaining ?? "?"}`
      );
    } catch (error) {
      console.warn(`Odds API seed skipped ${sportKey}: ${error.message}`);
    }
  }
}

if (items.length) {
  const ingested = await ingestNormalizedSportsbookFeed(items);
  console.log(
    `Odds API sports seeded: ${ingested.events.length} events from ${usedKeys.join(", ")}`
  );
} else {
  console.log("Odds API sports seed returned no events");
}

await mongoose.disconnect();
