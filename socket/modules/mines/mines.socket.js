import { io } from "../../socket.js";
import service from "./mines.service.js";
import jwt from "jsonwebtoken";

const setupMinesSocket = () => {
  const minesNamespace = io.of("/mines");

  minesNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) {
        return next(new Error("Invalid token"));
      }

      socket.data.userId = decoded.id;
      next();
    } catch (err) {
      return next(new Error("Invalid token"));
    }
  });

  minesNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined mines`);

    socket.join(`mines:${userId}`);

    socket.on("get_active_game", async () => {
      try {
        const result = await service.getActiveGame(userId);
        if (result.success) {
          socket.emit("game_state", result.game);
        }
      } catch (err) {
        socket.emit("error", { message: "Connection error" });
      }
    });

    socket.on("add_game", async (data) => {
      try {
        const { betAmount, mines } = data;
        if (!betAmount || !mines) {
          throw new Error("Missing required game parameters");
        }

        const result = await service.join(userId, betAmount, mines);
        if (result.success) {
          socket.emit("game_state", {
            ...result.game,
            hasActiveGame: result.hasActiveGame,
            message: result.message,
          });
        } else {
          socket.emit("error", { message: "Game error" });
        }
      } catch (err) {
        socket.emit("error", { message: "Connection error" });
      }
    });

    socket.on("continue_game", async () => {
      try {
        const result = await service.continueGame(userId);

        if (result.success) {
          socket.emit("game_state", {
            ...result.game,
            hasActiveGame: false,
            message: result.message,
          });
        } else {
          socket.emit("error", { message: "Connection error" });
        }
      } catch (err) {
        socket.emit("error", { message: "Connection error" });
      }
    });

    socket.on("reveal", async (data) => {
      try {
        const { index } = data;
        if (typeof index !== "number" || index < 0 || index > 24) {
          throw new Error("Invalid tile index");
        }

        const result = await service.reveal(userId, index);
        if (result.success) {
          socket.emit("game_state", result.game);
          if (result.result === "bomb") {
            socket.emit("game_over", { game: result.game });
          } else if (result.result === "diamond" && result.game.gameWon) {
            socket.emit("game_won", { game: result.game });
          }
        } else {
          socket.emit("error", { message: "Game error" });
        }
      } catch (err) {
        socket.emit("error", { message: "Connection error" });
      }
    });

    socket.on("checkout", async () => {
      try {
        const result = await service.checkout(userId);
        if (result.success) {
          socket.emit("game_state", {
            checkedOut: true,
            grid: Array(25)
              .fill()
              .map(() => ({ type: "diamond", revealed: false })),
            gameOver: false,
            gameWon: false,
            hasActiveGame: false,
            profit: result.profit,
            revealedDiamonds: result.revealedDiamonds,
          });
        } else {
          socket.emit("error", { message: "Connection error" });
        }
      } catch (err) {
        socket.emit("error", { message: "Connection error" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Mines`);
    });
  });
};

export default setupMinesSocket;
