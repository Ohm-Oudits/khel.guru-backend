import { io } from "../../socket.js";
import service from "./plinko.service.js";
import jwt from "jsonwebtoken";

const setupPlinkoSocket = () => {
  const plinkoNamespace = io.of("/plinko");

  plinkoNamespace.use((socket, next) => {
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

  plinkoNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined plinko`);

    socket.join(`plinko:${userId}`);

    socket.on("add_game", async (data) => {
      try {
        await service.join(userId);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("result", async (data) => {
      try {
        // walletType rides along inside data (defaults to "demo" in the service).
        const { walletType } = data || {};
        const result = await service.result({ ...data, walletType }, userId);

        if (result.error) {
          socket.emit("error", { message: result.error });
          return;
        }

        // Emit success with updated balance and result
        socket.emit("result_success", result.data);

        // Broadcast to user's room for potential UI updates
        socket.to(`plinko:${userId}`).emit("game_update", {
          type: "result",
          data: result.data,
        });
      } catch (err) {
        console.error("Result handling error:", err);
        socket.emit("error", { message: "Failed to process game result" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Plinko`);
    });
  });
};

export default setupPlinkoSocket;
