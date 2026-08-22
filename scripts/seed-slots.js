import dotenv from "dotenv";
import mongoose from "mongoose";

import ProviderGame from "../models/providerGame.model.js";

dotenv.config();

// Sandbox aggregator catalog. Replace these with a real partner feed
// (Hub88 / Softswiss / studio) without changing the public list/launch shape.
export const SANDBOX_SLOTS = [
  { slug: "neon-tiger", name: "Neon Tiger", studio: "Khel Labs", theme: "#FF7A18", rtp: 96.4, volatility: "high", img: "/games/slots/neon-tiger.png" },
  { slug: "mango-rush", name: "Mango Rush", studio: "Khel Labs", theme: "#F4C430", rtp: 96.1, volatility: "medium", img: "/games/slots/mango-rush.png" },
  { slug: "lotus-reels", name: "Lotus Reels", studio: "Amber Line", theme: "#E056FD", rtp: 96.8, volatility: "low", img: "/games/slots/lotus-reels.png" },
  { slug: "royal-dhol", name: "Royal Dhol", studio: "Amber Line", theme: "#FF4D6D", rtp: 95.9, volatility: "high", img: "/games/slots/royal-dhol.png" },
  { slug: "temple-gold", name: "Temple Gold", studio: "Northwind", theme: "#FFD700", rtp: 96.2, volatility: "medium", img: "/games/slots/temple-gold.png" },
  { slug: "monsoon-gems", name: "Monsoon Gems", studio: "Northwind", theme: "#00B4D8", rtp: 97.0, volatility: "low", img: "/games/slots/monsoon-gems.png" },
  { slug: "spice-fire", name: "Spice Fire", studio: "Khel Labs", theme: "#E85D04", rtp: 96.0, volatility: "high", img: "/games/slots/spice-fire.png" },
  { slug: "peacock-ways", name: "Peacock Ways", studio: "Amber Line", theme: "#2EC4B6", rtp: 96.5, volatility: "medium", img: "/games/slots/peacock-ways.png" },
  { slug: "desert-coins", name: "Desert Coins", studio: "Northwind", theme: "#C9A227", rtp: 95.8, volatility: "medium", img: "/games/slots/desert-coins.png" },
  { slug: "night-bazaar", name: "Night Bazaar", studio: "Khel Labs", theme: "#7B2CBF", rtp: 96.3, volatility: "high", img: "/games/slots/night-bazaar.png" },
  { slug: "jade-drums", name: "Jade Drums", studio: "Amber Line", theme: "#2D6A4F", rtp: 96.7, volatility: "low", img: "/games/slots/jade-drums.png" },
  { slug: "star-samosa", name: "Star Samosa", studio: "Khel Labs", theme: "#F77F00", rtp: 96.2, volatility: "medium", img: "/games/slots/star-samosa.png" },
];

export const seedSlots = async () => {
  let created = 0;
  let updated = 0;

  for (const slot of SANDBOX_SLOTS) {
    const res = await ProviderGame.updateOne(
      { slug: slot.slug },
      {
        $set: {
          name: slot.name,
          provider: "sandbox",
          studio: slot.studio,
          category: "slots",
          providerGameId: `sandbox:${slot.slug}`,
          img: slot.img || "",
          theme: slot.theme,
          rtp: slot.rtp,
          volatility: slot.volatility,
          demoEnabled: true,
          enabled: true,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount) created += 1;
    else updated += 1;
  }

  return { created, updated, total: SANDBOX_SLOTS.length };
};

const isDirectRun = process.argv[1] && process.argv[1].endsWith("seed-slots.js");

if (isDirectRun) {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is required to seed slots");
    process.exit(1);
  }
  mongoose
    .connect(MONGODB_URI)
    .then(seedSlots)
    .then((summary) => {
      console.log(
        `Slots seeded: ${summary.created} created, ${summary.updated} updated, ${summary.total} total`
      );
      return mongoose.disconnect();
    })
    .catch(async (error) => {
      console.error("Slot seed failed:", error.message);
      await mongoose.disconnect();
      process.exit(1);
    });
}
