import { io } from "../../socket.js";
import service from "./scratch.service.js";

const setupScratchSocket = () => {
  const scratchNamespace = io.of("/scratch");

  scratchNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined scratch`);

    socket.join(`scratch:${userId}`);

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

export default setupScratchSocket;
