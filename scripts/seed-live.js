import dotenv from "dotenv";
import mongoose from "mongoose";

import ProviderGame from "../models/providerGame.model.js";

dotenv.config();

// Sandbox live-dealer catalog. Swap for Evolution / Pragmatic Live / studio
// feed later without changing the public list/launch shape.
export const SANDBOX_LIVE = [
  { slug: "lightning-roulette", name: "Lightning Roulette", studio: "Khel Live", theme: "#E63946", tableType: "roulette", icon: "⚡", img: "/games/live/lightning-roulette.png" },
  { slug: "immersive-roulette", name: "Immersive Roulette", studio: "Khel Live", theme: "#C9A227", tableType: "roulette", icon: "🎡", img: "/games/live/immersive-roulette.png" },
  { slug: "auto-roulette", name: "Auto Roulette", studio: "Khel Live", theme: "#2EC4B6", tableType: "roulette", icon: "🔴", img: "/games/live/auto-roulette.png" },
  { slug: "live-blackjack", name: "Live Blackjack", studio: "Khel Live", theme: "#1D3557", tableType: "blackjack", icon: "🃏", img: "/games/live/live-blackjack.png" },
  { slug: "infinite-blackjack", name: "Infinite Blackjack", studio: "Khel Live", theme: "#457B9D", tableType: "blackjack", icon: "🂡", img: "/games/live/infinite-blackjack.png" },
  { slug: "live-baccarat", name: "Live Baccarat", studio: "Khel Live", theme: "#6A040F", tableType: "baccarat", icon: "♦", img: "/games/live/live-baccarat.png" },
  { slug: "speed-baccarat", name: "Speed Baccarat", studio: "Khel Live", theme: "#9D0208", tableType: "baccarat", icon: "♠", img: "/games/live/speed-baccarat.png" },
  { slug: "dream-catcher", name: "Dream Catcher", studio: "Khel Live", theme: "#7209B7", tableType: "show", icon: "🎯", img: "/games/live/dream-catcher.png" },
  { slug: "crazy-time", name: "Crazy Time", studio: "Khel Live", theme: "#F77F00", tableType: "show", icon: "🎪", img: "/games/live/crazy-time.png" },
  { slug: "mega-ball", name: "Mega Ball", studio: "Khel Live", theme: "#00B4D8", tableType: "show", icon: "🔵", img: "/games/live/mega-ball.png" },
];

export const seedLive = async () => {
  let created = 0;
  let updated = 0;

  for (const table of SANDBOX_LIVE) {
    const res = await ProviderGame.updateOne(
      { slug: table.slug },
      {
        $set: {
          name: table.name,
          provider: "sandbox-live",
          studio: table.studio,
          category: "live",
          providerGameId: `sandbox-live:${table.slug}`,
          img: table.img || "",
          theme: table.theme,
          tableType: table.tableType,
          playPath: "",
          rtp: 97.3,
          volatility: "live",
          demoEnabled: true,
          enabled: true,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount) created += 1;
    else updated += 1;
  }

  return { created, updated, total: SANDBOX_LIVE.length };
};

const isDirectRun = process.argv[1] && process.argv[1].endsWith("seed-live.js");

if (isDirectRun) {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is required to seed live tables");
    process.exit(1);
  }
  mongoose
    .connect(MONGODB_URI)
    .then(seedLive)
    .then((summary) => {
      console.log(
        `Live tables seeded: ${summary.created} created, ${summary.updated} updated, ${summary.total} total`
      );
      return mongoose.disconnect();
    })
    .catch(async (error) => {
      console.error("Live seed failed:", error.message);
      await mongoose.disconnect();
      process.exit(1);
    });
}
