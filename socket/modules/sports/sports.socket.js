import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import { io } from "../../socket.js";

const SPORT_GROUPS = ["cricket", "football", "tennis", "badminton"];

const setupSportsSocket = () => {
  const sportsNamespace = io.of("/sports");

  sportsNamespace.use((socket, next) => {
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

  sportsNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined sports`);

    socket.on("subscribe_event", ({ eventId } = {}) => {
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        socket.emit("error", { message: "Invalid event id" });
        return;
      }
      socket.join(`sports:event:${eventId}`);
    });

    socket.on("unsubscribe_event", ({ eventId } = {}) => {
      if (!mongoose.Types.ObjectId.isValid(eventId)) return;
      socket.leave(`sports:event:${eventId}`);
    });

    socket.on("subscribe_sport", ({ sportKey } = {}) => {
      const group = String(sportKey || "").toLowerCase().trim();
      if (!SPORT_GROUPS.includes(group)) {
        socket.emit("error", { message: "Unknown sport" });
        return;
      }
      socket.join(`sports:sport:${group}`);
    });

    socket.on("unsubscribe_sport", ({ sportKey } = {}) => {
      const group = String(sportKey || "").toLowerCase().trim();
      socket.leave(`sports:sport:${group}`);
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Sports`);
    });
  });
};

export default setupSportsSocket;
