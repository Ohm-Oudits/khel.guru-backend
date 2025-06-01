import { io } from "../../socket.js";
import service from "./roulette.service.js";
import jwt from "jsonwebtoken";
import { verifyToken } from "../../../middleware/userTokenCheck.js";
import User from "../../../models/user.model.js";

const setupRouletteSocket = () => {
  const rouletteNamespace = io.of("/roulette");

  rouletteNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      console.log("[Roulette] Authenticating socket connection...");

      if (!token) {
        console.error("[Roulette] Authentication failed: No token provided");
        return next(new Error("Authentication token required"));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.id) {
          console.error(
            "[Roulette] Authentication failed: Invalid token structure"
          );
          return next(new Error("Invalid token structure"));
        }

        const user = await User.findById(decoded.id);
        if (!user) {
          console.error("[Roulette] Authentication failed: User not found");
          return next(new Error("User not found"));
        }

        socket.user = user;
        console.log(
          `[Roulette] User authenticated: ${user.username} (${user._id})`
        );
        next();
      } catch (jwtError) {
        console.error("[Roulette] JWT verification failed:", jwtError.message);
        return next(new Error("Invalid token"));
      }
    } catch (error) {
      console.error("[Roulette] Authentication error:", error.message);
      next(new Error("Authentication failed"));
    }
  });

  rouletteNamespace.on("connection", (socket) => {
    console.log(
      `[Roulette] New connection established - Socket ID: ${socket.id}`
    );
    console.log(
      `[Roulette] Connected user: ${socket.user.username} (${socket.user._id})`
    );

    socket.join(`roulette:${socket.user._id}`);

    socket.on("join_game", async () => {
      try {
        console.log(
          `[Roulette] User ${socket.user.username} attempting to join game...`
        );

        await socket.join("roulette_game");
        console.log(`[Roulette] User ${socket.user.username} joined game room`);

        socket.emit("game_joined", { success: true });
      } catch (error) {
        console.error(
          `[Roulette] Error joining game for user ${socket.user.username}:`,
          error.message
        );
        socket.emit("error", "Failed to join game");
      }
    });

    socket.on("place_bet", async (data) => {
      try {
        console.log(
          `[Roulette] Bet placement request from ${socket.user.username}:`,
          {
            bets: data.bets,
            totalAmount: data.totalAmount,
          }
        );

        if (!data.bets || !data.totalAmount) {
          console.error("[Roulette] Invalid bet data received:", data);
          throw new Error("Invalid bet data");
        }

        const calculatedTotal = Object.values(data.bets).reduce(
          (sum, amount) => sum + amount,
          0
        );

        if (Math.abs(calculatedTotal - data.totalAmount) > 0.000001) {
          console.error("[Roulette] Bet amount mismatch:", {
            provided: data.totalAmount,
            calculated: calculatedTotal,
          });
          throw new Error("Bet amount mismatch");
        }

        console.log(`[Roulette] Processing bet for ${socket.user.username}...`);
        const result = await service.placeBet(socket.user._id, {
          bets: data.bets,
          totalAmount: data.totalAmount,
        });

        console.log(`[Roulette] Bet result for ${socket.user.username}:`, {
          result: result.result,
          totalWin: result.totalWin,
          totalLoss: result.totalLoss,
        });

        socket.emit("bet_result", result);

        rouletteNamespace.to("roulette_game").emit("game_result", {
          result: result.result,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(
          `[Roulette] Error processing bet for ${socket.user.username}:`,
          error.message
        );
        socket.emit("error", error.message || "Failed to process bet");
      }
    });

    socket.on("auto_bet", async (data) => {
      try {
        console.log(
          `[Roulette] Auto bet request from ${socket.user.username}:`,
          {
            bets: data.bets,
            totalAmount: data.totalAmount,
            numberOfBets: data.numberOfBets,
          }
        );

        if (!data.bets || !data.totalAmount || !data.numberOfBets) {
          console.error("[Roulette] Invalid auto bet data received:", data);
          throw new Error("Invalid auto bet data");
        }

        for (let i = 0; i < data.numberOfBets; i++) {
          console.log(
            `[Roulette] Processing auto bet ${i + 1}/${data.numberOfBets} for ${
              socket.user.username
            }`
          );

          const result = await service.placeBet(
            socket.user._id,
            data.bets,
            data.totalAmount
          );

          console.log(`[Roulette] Auto bet ${i + 1} result:`, {
            result: result.result,
            totalWin: result.totalWin,
            totalLoss: result.totalLoss,
          });

          socket.emit("bet_result", result);

          rouletteNamespace.to("roulette_game").emit("game_result", {
            result: result.result,
            timestamp: new Date(),
          });

          if (i < data.numberOfBets - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      } catch (error) {
        console.error(
          `[Roulette] Error processing auto bet for ${socket.user.username}:`,
          error.message
        );
        socket.emit("error", error.message || "Failed to process auto bet");
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Roulette] User ${socket.user.username} disconnected:`, {
        socketId: socket.id,
        reason: reason,
      });
    });

    socket.on("error", (error) => {
      console.error(
        `[Roulette] Socket error for user ${socket.user.username}:`,
        error
      );
    });
  });

  console.log("[Roulette] Socket namespace initialized successfully");
};

export default setupRouletteSocket;
