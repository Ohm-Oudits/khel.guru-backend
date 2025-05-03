import { io } from "../../socket.js";
import service from "./parachute.service.js";
import jwt from "jsonwebtoken";

const setupParachuteSocket = () => {
  const parachuteNamespace = io.of("/parachute");

  parachuteNamespace.use((socket, next) => {
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

  parachuteNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(`parachute:${userId}`);

    socket.on("add_game", async (data) => {
      try {
        await service.join(userId);
      } catch (err) {
        console.error("Error in add_game:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("crash", async (data) => {
      try {
        console.log(`Crashed at : ${data?.value} for user `, userId);
      } catch (error) {
        console.error("Error in add_game:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("checkout", async (data) => {
      try {
        console.log("Checkout Hit By User : ", userId);
        console.log(data);
      } catch (error) {
        console.error("Error in add_game:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Parachute`);
    });
  });
};

export default setupParachuteSocket;
