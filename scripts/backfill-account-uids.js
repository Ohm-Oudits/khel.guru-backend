import dotenv from "dotenv";
import mongoose from "mongoose";

import User from "../models/user.model.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI is required to backfill account uids");
  process.exit(1);
}

const main = async () => {
  await mongoose.connect(MONGODB_URI);

  let assigned = 0;
  const cursor = User.find({
    $or: [{ accountUid: { $exists: false } }, { accountUid: null }],
  }).cursor();

  for await (const user of cursor) {
    // The pre-validate hook assigns the uid on save.
    await user.save();
    assigned += 1;
    console.log(`assigned ${user.accountUid} -> ${user.username}`);
  }

  console.log(`Backfill complete. ${assigned} user(s) updated.`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Backfill failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
