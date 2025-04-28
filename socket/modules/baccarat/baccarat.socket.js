import { io } from "../../socket.js";
import service from "./baccarat.service.js";

const setupBaccaratSocket = () => {
  const baccaratNamespace = io.of("/baccarat");

  baccaratNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined baccarat`);

    socket.join(`baccarat:${userId}`);

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

export default setupBaccaratSocket;
