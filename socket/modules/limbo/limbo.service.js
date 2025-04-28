import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";

const service = {
  async join(userId) {
    const game = await Game.findOne({ name: "limbo" });

    // add this game to user.continuedGames if already there then move it to front
    const user = await User.findById(userId);

    // return error if there is
  },
};

export default service;
