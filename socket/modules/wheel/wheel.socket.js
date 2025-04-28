import { io } from "../../socket.js";
import service from "./wheel.service.js";

const setupWheelSocket = () => {
  const wheelNamespace = io.of("/wheel");

  wheelNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined wheel`);

    socket.join(`wheel:${userId}`);

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

export default setupWheelSocket;
