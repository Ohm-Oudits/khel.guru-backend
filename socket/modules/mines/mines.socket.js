import { io } from "../../socket.js";
import service from "./mines.service.js";

const setupMinesSocket = () => {
  const minesNamespace = io.of("/mines");

  minesNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined mines`);

    socket.join(`mines:${userId}`);

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

export default setupMinesSocket;
