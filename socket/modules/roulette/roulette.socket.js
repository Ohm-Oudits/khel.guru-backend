import { io } from "../../socket.js";
import service from "./roulette.service.js";

const setupRouletteSocket = () => {
  const rouletteNamespace = io.of("/roulette");

  rouletteNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined roulette`);

    socket.join(`roulette:${userId}`);

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

export default setupRouletteSocket;
