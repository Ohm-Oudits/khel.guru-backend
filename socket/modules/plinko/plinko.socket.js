import { io } from "../../socket.js";
import service from "./plinko.service.js";

const setupPlinkoSocket = () => {
  const plinkoNamespace = io.of("/plinko");

  plinkoNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined plinko`);

    socket.join(`plinko:${userId}`);

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

export default setupPlinkoSocket;
