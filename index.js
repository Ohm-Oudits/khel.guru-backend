import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";
import { setupSocket } from "./socket/socket.js";

// Import middleware
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { apiLimiter, authLimiter } from "./middleware/rateLimiter.js";

// Import routes
import userRoutes from "./routes/user.route.js";
import gameRoutes from "./routes/game.route.js";
import sportRoutes from "./routes/sport.route.js";
import walletRoutes from "./routes/wallet.route.js";

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

// Trust proxy for rate limiting and security
app.set("trust proxy", 1);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

// Logging middleware
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "*"],
        fontSrc: ["'self'", "https:", "data:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Additional security headers
app.use((req, res, next) => {
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()"
  );
  next();
});

// CORS configuration
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean)
      : "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Rate limiting
app.use("/api/", apiLimiter);
app.use("/api/user/login", authLimiter);
app.use("/api/user/register", authLimiter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

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

// API Routes
app.use("/api/user", userRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/sport", sportRoutes);
app.use("/api/wallet", walletRoutes);

// 404 handler for unknown routes
app.use(notFound);

// Global error handler
app.use(errorHandler);

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
