import dotenv from "dotenv";
import mongoose from "mongoose";

import Game from "../models/game.model.js";

dotenv.config();

// The originals catalog. `name` must match the literal each socket service
// looks up via Game.findOne({ name }) — without these documents every game
// fails "Game not found" on join.
export const ORIGINAL_GAMES = [
  { name: "dice", description: ["Roll over or under your target and win."] },
  { name: "limbo", description: ["Set a target multiplier and beat the crash."] },
  { name: "crash", description: ["Cash out before the multiplier crashes."] },
  { name: "mines", description: ["Uncover gems and avoid the mines."] },
  { name: "plinko", description: ["Drop the ball and chase the multipliers."] },
  { name: "keno", description: ["Pick your numbers and match the draw."] },
  { name: "wheel", description: ["Spin the wheel of fortune."] },
  { name: "hilo", description: ["Guess higher or lower to build a streak."] },
  { name: "tower", description: ["Climb the tower avoiding the traps."] },
  { name: "twist", description: ["Spin the twist and land a win."] },
  { name: "slide", description: ["Ride the multiplier and cash out in time."] },
  { name: "pump", description: ["Pump the multiplier before it pops."] },
  { name: "parachute", description: ["Float up the multiplier and land safely."] },
  { name: "scratch", description: ["Scratch the card to reveal your prize."] },
  { name: "roulette", description: ["Place your bets and spin the wheel."] },
  { name: "blackjack", description: ["Beat the dealer to twenty-one."] },
  { name: "baccarat", description: ["Bet on player, banker, or a tie."] },
];

export const seedGames = async () => {
  let created = 0;
  let updated = 0;
  for (const game of ORIGINAL_GAMES) {
    const res = await Game.updateOne(
      { name: game.name },
      { $setOnInsert: { name: game.name }, $set: { description: game.description } },
      { upsert: true }
    );
    if (res.upsertedCount) created += 1;
    else updated += 1;
  }
  return { created, updated, total: ORIGINAL_GAMES.length };
};

const isDirectRun = process.argv[1] && process.argv[1].endsWith("seed-games.js");

if (isDirectRun) {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is required to seed games");
    process.exit(1);
  }
  mongoose
    .connect(MONGODB_URI)
    .then(seedGames)
    .then((summary) => {
      console.log(
        `Games seeded: ${summary.created} created, ${summary.updated} updated, ${summary.total} total`
      );
      return mongoose.disconnect();
    })
    .catch(async (error) => {
      console.error("Game seed failed:", error.message);
      await mongoose.disconnect();
      process.exit(1);
    });
}
