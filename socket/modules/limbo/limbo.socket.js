import { io } from "../../socket.js";
import service from "./limbo.service.js";

const setupLimboSocket = () => {
  const limboNamespace = io.of("/limbo");

  limboNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined limbo`);

    socket.join(`limbo:${userId}`);

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

export default setupLimboSocket;
