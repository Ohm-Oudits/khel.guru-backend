import { io } from "../../socket.js";
import service from "./blackjack.service.js";

const setupBlackjackSocket = () => {
  const blackjackNamespace = io.of("/blackjack");

  blackjackNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined blackjack`);

    socket.join(`blackjack:${userId}`);

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

export default setupBlackjackSocket;
