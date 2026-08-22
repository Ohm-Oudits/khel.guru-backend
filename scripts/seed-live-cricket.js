import dotenv from "dotenv";
import mongoose from "mongoose";

import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import { ingestNormalizedSportsbookFeed } from "../services/sportsbookIngest.service.js";
import { recordUsage } from "../services/providerUsage.service.js";
import { fetchTheOddsApiOdds } from "../services/sportsbookProviders/theOddsApiProvider.js";
import {
  fetchCricketDemoFeed,
  fetchLiveCricketDemoFeed,
} from "../services/sportsbookProviders/mockSportsbookProvider.js";
import { resolveOddsSportKeys } from "../services/sportsbookSportKeys.js";

dotenv.config();

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is required to seed live cricket");
}

await mongoose.connect(mongoUri);
await Promise.all([Market.init(), OddsSnapshot.init(), SportsEvent.init()]);

const demoItems = process.env.THE_ODDS_API_KEY
  ? await fetchLiveCricketDemoFeed({ includeMarkets: false })
  : await fetchCricketDemoFeed();
const demoResult = await ingestNormalizedSportsbookFeed(demoItems);
console.log(
  `Cricket demo seeded: ${demoResult.events.length} events (${demoItems
    .map((item) => `${item.status}:${item.leagueName}`)
    .join(", ")})`
);

let oddsItems = [];
if (process.env.THE_ODDS_API_KEY) {
  try {
    const keys = await resolveOddsSportKeys("cricket");
    for (const sportKey of keys) {
      const result = await fetchTheOddsApiOdds({ sportKey });
      await recordUsage("the-odds-api", result.usage);
      oddsItems.push(...(result.items || []));
    }
    if (oddsItems.length) {
      const oddsResult = await ingestNormalizedSportsbookFeed(oddsItems);
      console.log(
        `Odds API cricket ingested: ${oddsResult.events.length} events from ${keys.join(", ")}`
      );
    } else {
      console.log("Odds API cricket returned no events");
    }
  } catch (error) {
    console.warn(`Odds API cricket skipped: ${error.message}`);
  }
}

await mongoose.disconnect();
