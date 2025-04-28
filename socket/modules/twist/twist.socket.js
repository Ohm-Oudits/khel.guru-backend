import { io } from "../../socket.js";
import service from "./twist.service.js";

const setupTwistSocket = () => {
  const twistNamespace = io.of("/twist");

  twistNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined twist`);

    socket.join(`twist:${userId}`);

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

export default setupTwistSocket;
