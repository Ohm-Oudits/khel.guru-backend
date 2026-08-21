import { io } from "../../socket.js";
import service, { cleanup, startGameLoop } from "./slide.service.js";
import jwt from "jsonwebtoken";

const setupSlideSocket = () => {
  const slideNamespace = io.of("/slide");

  slideNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      socket.data.userId = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) {
        console.log("Decoded token missing 'id'");
        return next(new Error("Invalid token"));
      }

      socket.data.userId = decoded.id;
      next();
    } catch (err) {
      console.error("Token verification failed:", err.message);
      return next(new Error("Invalid token"));
    }
  });

  slideNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(
      userId ? `User ${userId} joined slide` : "Guest joined slide as spectator"
    );

    if (userId) {
      socket.join(`slide:${userId}`);
    }

    socket.on("join_game", async () => {
      try {
        const result = await service.join(userId);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("game_state", result.gameState);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("place_bet", async (betData) => {
      try {
        if (!userId) {
          socket.emit("error", { message: "Authentication required" });
          return;
        }

        const result = await service.placeBet(userId, betData);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("bet_placed", {
          betAmount: betData.betAmount,
          targetMultiplier: betData.targetMultiplier,
          newBalance: result.newBalance,
          timestamp: Date.now(),
        });

        slideNamespace.emit("bets_updated", {
          totalBets: service.getActiveBetsCount(),
          timestamp: Date.now(),
        });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("place_auto_bet", async (autoBetData) => {
      try {
        if (!userId) {
          socket.emit("error", { message: "Authentication required" });
          return;
        }

        const { betAmount, targetMultiplier, numberOfBets, walletType } =
          autoBetData;

        if (!numberOfBets || numberOfBets <= 0 || numberOfBets > 100) {
          socket.emit("error", { message: "Invalid number of bets" });
          return;
        }

        const result = await service.placeBet(userId, {
          betAmount,
          targetMultiplier,
          walletType,
        });
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.data.autoBet = {
          remainingBets: numberOfBets - 1,
          betAmount,
          targetMultiplier,
          walletType,
        };

        socket.emit("auto_bet_started", {
          totalBets: numberOfBets,
          remainingBets: numberOfBets - 1,
          betAmount,
          targetMultiplier,
        });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(
        userId
          ? `❌ User ${userId} disconnected from Slide`
          : "❌ Guest disconnected from Slide"
      );
      delete socket.data.autoBet;
    });
  });

  slideNamespace.on("round_result", async (data) => {
    const sockets = await slideNamespace.fetchSockets();
    for (const socket of sockets) {
      const autoBet = socket.data.autoBet;
      if (autoBet && autoBet.remainingBets > 0) {
        const result = await service.placeBet(socket.data.userId, {
          betAmount: autoBet.betAmount,
          targetMultiplier: autoBet.targetMultiplier,
          walletType: autoBet.walletType,
        });

        if (result.success) {
          autoBet.remainingBets--;
          socket.emit("auto_bet_updated", {
            remainingBets: autoBet.remainingBets,
            betAmount: autoBet.betAmount,
            targetMultiplier: autoBet.targetMultiplier,
          });

          if (autoBet.remainingBets === 0) {
            socket.emit("auto_bet_complete");
            delete socket.data.autoBet;
          }
        } else {
          socket.emit("error", { message: result.error });
          delete socket.data.autoBet;
        }
      }
    }
  });

  process.on("SIGTERM", () => {
    cleanup();
  });

  startGameLoop();
};

export default setupSlideSocket;
