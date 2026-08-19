import dotenv from "dotenv";
import mongoose from "mongoose";

import User from "../models/user.model.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const DEV_USER = {
  username: process.env.KG_DEV_USER_USERNAME || "testplayer",
  email: process.env.KG_DEV_USER_EMAIL || "test@khel.guru",
  password: process.env.KG_DEV_USER_PASSWORD || "Test@123456",
  phoneNumber: process.env.KG_DEV_USER_PHONE || "+919999000001",
};

if (!MONGODB_URI) {
  console.error("MONGODB_URI is required to seed a dev user");
  process.exit(1);
}

const main = async () => {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  let user = await User.findOne({
    $or: [{ email: DEV_USER.email }, { username: DEV_USER.username }],
  });

  if (!user) {
    user = new User({
      ...DEV_USER,
      emailVerified: true,
      phoneNumberVerified: true,
      roles: ["player"],
      preferredCurrency: "INR",
      accountStatus: "active",
    });

    await user.save();
    console.log(`Created dev user ${DEV_USER.email}`);
  } else {
    user.username = DEV_USER.username;
    user.email = DEV_USER.email;
    user.password = DEV_USER.password;
    user.phoneNumber = DEV_USER.phoneNumber;
    user.emailVerified = true;
    user.phoneNumberVerified = true;
    user.roles = ["player"];
    user.preferredCurrency = "INR";
    user.accountStatus = "active";
    await user.save();
    console.log(`Updated dev user ${DEV_USER.email}`);
  }

  console.log(
    JSON.stringify(
      {
        credentials: DEV_USER,
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error("Failed to seed dev user", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
