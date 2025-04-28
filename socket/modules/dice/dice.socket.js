import { io } from "../../socket.js";
import service from "./dice.service.js";

const setupDiceSocket = () => {
  const diceNamespace = io.of("/dice");

  diceNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined dice`);

    socket.join(`dice:${userId}`);

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

export default setupDiceSocket;
