import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";
import { setupSocket } from "./socket/socket.js";

import userRoutes from "./routes/user.route.js";
import gameRoutes from "./routes/game.route.js";
import sportRoutes from "./routes/sport.route.js";

import setupBaccaratSocket from "./socket/modules/baccarat/baccarat.socket.js";
import setupBlackjackSocket from "./socket/modules/blackjack/blackjack.socket.js";
import setupCrashSocket from "./socket/modules/crash/crash.socket.js";
import setupDiceSocket from "./socket/modules/dice/dice.socket.js";
import setupHiloSocket from "./socket/modules/hilo/hilo.socket.js";
import setupKenoSocket from "./socket/modules/keno/keno.socket.js";
import setupLimboSocket from "./socket/modules/limbo/limbo.socket.js";
import setupMinesSocket from "./socket/modules/mines/mines.socket.js";
import setupParachuteSocket from "./socket/modules/parachute/parachute.socket.js";
import setupPlinkoSocket from "./socket/modules/plinko/plinko.socket.js";
import setupPumpSocket from "./socket/modules/pump/pump.socket.js";
import setupRouletteSocket from "./socket/modules/roulette/roulette.socket.js";
import setupScratchSocket from "./socket/modules/scratch/scratch.socket.js";
import setupSlideSocket from "./socket/modules/slide/slide.socket.js";
import setupTowerSocket from "./socket/modules/tower/tower.socket.js";
import setupTwistSocket from "./socket/modules/twist/twist.socket.js";
import setupWheelSocket from "./socket/modules/wheel/wheel.socket.js";

dotenv.config();
const app = express();
app.use(express.json());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ limit: "1mb", extended: true }));
app.use(morgan("combined"));

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "*"],
      },
    },
  })
);

app.use((req, res, next) => {
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );
  next();
});

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));

const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`Environment variable ${key} is missing!`);
    process.exit(1);
  }
});

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Database Connected Successfully!");
    server.listen(process.env.PORT || 8080, () => {
      console.log(`Server running on port ${process.env.PORT || 8080} 🔥`);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error.message);
    process.exit(1);
  });

app.use("/api/user", userRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/sport", sportRoutes);

app.use((req, res, next) => {
  res.status(404).json({ message: "API endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Sockets
const server = http.createServer(app);
setupSocket(server);

setupBaccaratSocket();
setupBlackjackSocket();
setupCrashSocket();
setupDiceSocket();
setupHiloSocket();
setupKenoSocket();
setupLimboSocket();
setupMinesSocket();
setupParachuteSocket();
setupPlinkoSocket();
setupPumpSocket();
setupRouletteSocket();
setupScratchSocket();
setupSlideSocket();
setupTowerSocket();
setupTwistSocket();
setupWheelSocket();
