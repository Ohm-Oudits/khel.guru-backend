import { io } from "../../socket.js";
import service from "./pump.service.js";

const setupPumpSocket = () => {
  const pumpNamespace = io.of("/pump");

  pumpNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined pump`);

    socket.join(`pump:${userId}`);

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

export default setupPumpSocket;
