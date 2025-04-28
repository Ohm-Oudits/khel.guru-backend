import { io } from "../../socket.js";
import service from "./tower.service.js";

const setupTowerSocket = () => {
  const towerNamespace = io.of("/tower");

  towerNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined tower`);

    socket.join(`tower:${userId}`);

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

export default setupTowerSocket;
