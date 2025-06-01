import { io } from "../../socket.js";
import service from "./baccarat.service.js";
import jwt from "jsonwebtoken";

const setupBaccaratSocket = () => {
  const baccaratNamespace = io.of("/baccarat");

  baccaratNamespace.use((socket, next) => {
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

      socket.data.userId = decoded.id;
      next();
    } catch (err) {
      console.error("Token verification failed:", err.message);
      return next(new Error("Invalid token"));
    }
  });

  baccaratNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined baccarat`);

    socket.join(`baccarat:${userId}`);

    let currentGameId = null;

    socket.on("join_game", async () => {
      try {
        const result = await service.join(userId);
        if (result.success) {
          currentGameId = result.gameId;
          socket.join(`game:${currentGameId}`);

          socket.emit("game_joined", result);

          baccaratNamespace
            .to(`game:${currentGameId}`)
            .emit("game_state_update", {
              type: "player_joined",
              gameId: currentGameId,
              status: result.status,
            });
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("place_bet", async ({ betType, amount }) => {
      if (!currentGameId) {
        socket.emit("error", { message: "Not in a game" });
        return;
      }

      try {
        const result = await service.placeBet(
          userId,
          currentGameId,
          betType,
          amount
        );
        if (result.success) {
          socket.emit("bet_placed", result);

          baccaratNamespace
            .to(`game:${currentGameId}`)
            .emit("game_state_update", {
              type: "bet_placed",
              gameId: currentGameId,
              bets: result.game.bets,
            });
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("start_dealing", async () => {
      if (!currentGameId) {
        socket.emit("error", { message: "Not in a game" });
        return;
      }

      try {
        const result = await service.dealCards(currentGameId);
        if (result.success) {
          baccaratNamespace
            .to(`game:${currentGameId}`)
            .emit("game_state_update", {
              type: "cards_dealt",
              gameId: currentGameId,
              playerCards: result.game.playerCards,
              bankerCards: result.game.bankerCards,
              playerScore: result.game.playerScore,
              bankerScore: result.game.bankerScore,
              winner: result.game.winner,
              bets: result.game.bets,
            });

          setTimeout(async () => {
            try {
              const newRound = await service.startNewRound(currentGameId);
              if (newRound.success) {
                currentGameId = newRound.game.gameId;
                socket.join(`game:${currentGameId}`);

                baccaratNamespace
                  .to(`game:${currentGameId}`)
                  .emit("game_state_update", {
                    type: "new_round",
                    gameId: currentGameId,
                    status: newRound.game.status,
                    currentRound: newRound.game.currentRound,
                  });
              }
            } catch (err) {
              socket.emit("error", { message: err.message });
            }
          }, 5000);
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("leave_game", () => {
      if (currentGameId) {
        socket.leave(`game:${currentGameId}`);
        currentGameId = null;
        socket.emit("game_left", { success: true });
      }
    });

    socket.on("disconnect", () => {
      if (currentGameId) {
        socket.leave(`game:${currentGameId}`);
        baccaratNamespace
          .to(`game:${currentGameId}`)
          .emit("game_state_update", {
            type: "player_left",
            gameId: currentGameId,
            userId: userId,
          });
      }
      console.log(`❌ User ${userId} disconnected from Baccarat`);
    });
  });
};

export default setupBaccaratSocket;
