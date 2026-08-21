import { io } from "../../socket.js";
import service from "./roulette.service.js";
import jwt from "jsonwebtoken";

const setupRouletteSocket = () => {
  const rouletteNamespace = io.of("/roulette");

  rouletteNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.error("[Roulette] Authentication failed: No token provided");
      return next(new Error("Authentication token required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) {
        console.error("[Roulette] Authentication failed: Invalid token structure");
        return next(new Error("Invalid token structure"));
      }

      socket.data.userId = decoded.id;
      next();
    } catch (jwtError) {
      console.error("[Roulette] JWT verification failed:", jwtError.message);
      return next(new Error("Invalid token"));
    }
  });

  const completeJoin = async (socket) => {
    const userId = socket.data.userId;
    await socket.join("roulette_game");

    const result = await service.join(userId);
    if (result.error) {
      console.warn(`[Roulette] Join stats skipped for ${userId}:`, result.error);
    }

    socket.emit("game_joined", { success: true });
  };

  rouletteNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`[Roulette] User connected (${userId}) - socket ${socket.id}`);

    socket.join(`roulette:${userId}`);

    completeJoin(socket).catch((error) => {
      console.error(`[Roulette] Error joining game for ${userId}:`, error.message);
      socket.emit("game_joined", { success: true });
    });

    socket.on("join_game", async () => {
      try {
        await completeJoin(socket);
      } catch (error) {
        console.error(
          `[Roulette] Error handling join_game for ${userId}:`,
          error.message
        );
        socket.emit("game_joined", { success: true });
      }
    });

    socket.on("place_bet", async (data) => {
      try {
        if (
          !data.bets ||
          data.totalAmount == null ||
          Number.isNaN(Number(data.totalAmount))
        ) {
          throw new Error("Invalid bet data");
        }

        const calculatedTotal = Object.values(data.bets).reduce(
          (sum, amount) => sum + amount,
          0
        );

        if (Math.abs(calculatedTotal - data.totalAmount) > 0.000001) {
          throw new Error("Bet amount mismatch");
        }

        const result = await service.placeBet(userId, {
          bets: data.bets,
          totalAmount: data.totalAmount,
          walletType: data.walletType,
        });

        if (result.error) {
          socket.emit("error", result.error);
          return;
        }

        socket.emit("bet_result", result);
        socket.emit("game_result", {
          result: result.result,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(
          `[Roulette] Error processing bet for ${userId}:`,
          error.message
        );
        socket.emit("error", error.message || "Failed to process bet");
      }
    });

    socket.on("auto_bet", async (data) => {
      try {
        if (
          !data.bets ||
          data.totalAmount == null ||
          Number.isNaN(Number(data.totalAmount)) ||
          !data.numberOfBets
        ) {
          throw new Error("Invalid auto bet data");
        }

        for (let i = 0; i < data.numberOfBets; i++) {
          const result = await service.placeBet(userId, {
            bets: data.bets,
            totalAmount: data.totalAmount,
            walletType: data.walletType,
          });

          if (result.error) {
            socket.emit("error", result.error);
            return;
          }

          socket.emit("bet_result", result);
          socket.emit("game_result", {
            result: result.result,
            timestamp: new Date(),
          });

          if (i < data.numberOfBets - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      } catch (error) {
        console.error(
          `[Roulette] Error processing auto bet for ${userId}:`,
          error.message
        );
        socket.emit("error", error.message || "Failed to process auto bet");
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Roulette] User ${userId} disconnected:`, reason);
    });
  });

  console.log("[Roulette] Socket namespace initialized successfully");
};

export default setupRouletteSocket;
