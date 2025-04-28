import { io } from "../../socket.js";
import service from "./hilo.service.js";

const setupHiloSocket = () => {
  const hiloNamespace = io.of("/hilo");

  hiloNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined hilo`);

    socket.join(`hilo:${userId}`);

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

export default setupHiloSocket;
