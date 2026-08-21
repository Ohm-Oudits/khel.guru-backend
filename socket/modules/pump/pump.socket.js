import { io } from "../../socket.js";
import service from "./pump.service.js";
import jwt from "jsonwebtoken";

const setupPumpSocket = () => {
  const pumpNamespace = io.of("/pump");

  pumpNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.log("Token not provided");
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) {
        console.log("Decoded token missing 'id'");
        return next(new Error("Invalid token"));
      }

      socket.data.userId = String(decoded.id);
      next();
    } catch (err) {
      console.error("Token verification failed:", err.message);
      return next(new Error("Invalid token"));
    }
  });

  pumpNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined pump`);

    socket.join(`pump:${userId}`);

    const sendHistory = () => {
      socket.emit("round_history", { history: service.getHistory(userId) });
    };

    sendHistory();

    socket.on("get_history", sendHistory);

    socket.on("add_game", async () => {
      try {
        await service.join(userId);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("place_bet", async (data) => {
      try {
        socket.data.roundSettled = false;

        const { betAmount, walletType, risk } = data || {};
        if (
          betAmount == null ||
          Number.isNaN(Number(betAmount)) ||
          Number(betAmount) <= 0
        ) {
          socket.emit("error", { message: "Invalid bet amount" });
          return;
        }

        const result = await service.startRound(
          userId,
          betAmount,
          risk,
          walletType
        );
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("bet_placed", {
          betAmount: result.betAmount,
          newBalance: result.newBalance,
          walletType: result.walletType,
        });

        socket.emit("round_started", {
          multiplier: result.multiplier,
          ladder: result.ladder,
          risk: result.risk,
          fairness: result.fairness,
        });
      } catch (err) {
        console.error("Error in pump place_bet:", err);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("pump", async () => {
      try {
        const result = service.pump(userId);
        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        if (result.popped) {
          if (socket.data.roundSettled) return;
          socket.data.roundSettled = true;

          const bust = await service.settlePop(userId, result.multiplier);
          const history = bust.history || service.getHistory(userId);

          socket.emit("balloon_popped", {
            multiplier: bust.multiplier ?? result.multiplier,
            popAt: bust.popAt ?? result.popAt,
            newBalance: bust.newBalance,
            history,
            fairness: bust.fairness,
          });
          socket.emit("round_history", { history });
          return;
        }

        socket.emit("pump_success", {
          multiplier: result.multiplier,
          gameState: result.gameState,
        });
      } catch (err) {
        console.error("Error in pump pump:", err);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("cash_out", async () => {
      try {
        if (socket.data.roundSettled) return;
        socket.data.roundSettled = true;

        const result = await service.cashOut(userId);
        if (result.error) {
          socket.data.roundSettled = false;
          socket.emit("error", { message: result.error });
          return;
        }

        socket.emit("cashout_success", {
          multiplier: result.multiplier,
          popAt: result.popAt,
          payout: result.payout,
          newBalance: result.newBalance,
          walletType: result.walletType,
          history: result.history,
          fairness: result.fairness,
        });
        socket.emit("round_history", { history: result.history });
      } catch (err) {
        socket.data.roundSettled = false;
        console.error("Error in pump cash_out:", err);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("bust", async () => {
      try {
        if (socket.data.roundSettled) return;
        socket.data.roundSettled = true;

        const result = await service.bust(userId);
        const history = result.history || service.getHistory(userId);

        socket.emit("bet_busted", {
          newBalance: result.newBalance ?? null,
          popAt: result.popAt ?? null,
          multiplier: result.multiplier ?? null,
          history,
          fairness: result.fairness,
        });
        if (history?.length) {
          socket.emit("round_history", { history });
        }
      } catch (err) {
        socket.data.roundSettled = false;
        console.error("Error in pump bust:", err);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      service.clearBet(userId);
      console.log(`❌ User ${userId} disconnected from Pump`);
    });
  });
};

export default setupPumpSocket;
