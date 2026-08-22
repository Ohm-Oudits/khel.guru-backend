import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import { io } from "../../socket.js";
import { listHydratedSportsEvents } from "../../../services/sportsbookEvents.service.js";
import { expandSportGroupQuery } from "../../../services/sportsbookCatalog.service.js";

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

    socket.on("subscribe_sport", async ({ sportKey } = {}) => {
      const requested = String(sportKey || "").toLowerCase().trim();
      const groups = expandSportGroupQuery(requested);
      if (!groups.length) {
        socket.emit("error", { message: "Unknown sport" });
        return;
      }
      for (const group of groups) {
        socket.join(`sports:sport:${group}`);
      }
      try {
        const events = await listHydratedSportsEvents({
          sportKey: requested,
          limit: 250,
        });
        socket.emit("sport_snapshot", { sportKey: requested, events });
      } catch (error) {
        socket.emit("error", { message: "Could not load sport snapshot" });
      }
    });

    socket.on("unsubscribe_sport", ({ sportKey } = {}) => {
      const groups = expandSportGroupQuery(sportKey);
      for (const group of groups) {
        socket.leave(`sports:sport:${group}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Sports`);
    });
  });
};

export default setupSportsSocket;
