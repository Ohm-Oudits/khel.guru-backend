import { io } from "../../socket.js";
import service from "./crash.service.js";

const setupCrashSocket = () => {
  const crashNamespace = io.of("/crash");

  crashNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined crash`);

    socket.join(`crash:${userId}`);

    socket.on("add_game", async (data) => {
      try {
        await service.join(userId);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // a function which returns no.of games played
  });
};

export default setupCrashSocket;
