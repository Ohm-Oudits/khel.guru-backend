import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

let io;

const setupSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  // Handle connection
  io.on("connection", async (socket) => {
    const userId = socket.data.userId;
    console.log(`User connected: ${userId}`);

    try {
      // Update user model with socketId
      await User.findByIdAndUpdate(
        userId,
        { socketId: socket.id },
        { new: true }
      );
      console.log(`Socket ID ${socket.id} set for user ${userId}`);

      socket.join(`user:${userId}`);

      // Handle disconnection
      socket.on("disconnect", async () => {
        console.log(`User disconnected: ${userId}`);
        await User.findByIdAndUpdate(userId, { socketId: null }, { new: true });
      });
    } catch (err) {
      console.error(`Error updating socketId for user ${userId}:`, err);
      socket.emit("error", { message: "Server error" });
      socket.disconnect();
    }
  });

  return io;
};

export { setupSocket, io };
