import Game from "../models/game.model.js";

export const createGame = async (req, res) => {
  const { name, creator, img, exclusive, isNew, description, hotkeys, info } =
    req.body;

  if (!name) {
    return res.status(400).json({ message: "Name is Not Given" });
  }

  try {
    const newGame = new Game({
      name,
      creator,
      img,
      exclusive,
      isNew,
      description,
      hotkeys,
      info,
    });

    const savedGame = await newGame.save();

    res
      .status(201)
      .json({ message: "Game Uploaded Successfully", game: savedGame });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateGame = async (req, res) => {
  const { name, creator, img, exclusive, isNew, description, hotkeys, info } =
    req.body;

  try {
    const updatedGame = await Game.findByIdAndUpdate(
      req.params.id,
      {
        name,
        creator,
        img,
        exclusive,
        isNew,
        description,
        hotkeys,
        info,
      },
      {
        new: true,
      }
    );
    if (!updatedGame)
      return res.status(404).json({ message: "Game not found" });
    res.json({ message: "Game Updated Successfully", game: updatedGame });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteGame = async (req, res) => {
  try {
    const deletedGame = await Game.findByIdAndDelete(req.params.id);
    if (!deletedGame)
      return res.status(404).json({ message: "Game not found" });
    res.json({ message: "Game deleted successfully", game: deletedGame });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const findGame = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name)
      return res.status(400).json({ message: "Name query is required" });

    const game = await Game.findOne({ name });
    if (!game) return res.status(404).json({ message: "Game not found" });

    res.json(game);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
