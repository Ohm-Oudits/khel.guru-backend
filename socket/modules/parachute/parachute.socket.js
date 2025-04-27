import { io } from "../../socket.js";
import service from "./parachute.service.js";

const setupParachuteSocket = () => {
  const parachuteNamespace = io.of("/parachute");

  parachuteNamespace.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`User ${userId} joined Parachute`);

    socket.join(`parachute:${userId}`);

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

export default setupParachuteSocket;
