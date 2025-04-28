import { io } from "../../socket.js";
import service from "./slide.service.js";

const setupSlideSocket = () => {
  const slideNamespace = io.of("/slide");

  slideNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined slide`);

    socket.join(`slide:${userId}`);

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

export default setupSlideSocket;
