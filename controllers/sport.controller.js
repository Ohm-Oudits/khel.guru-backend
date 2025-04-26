import Sport from "../models/sport.model.js";

export const createSport = async (req, res) => {
  const { name, img, description, liveEvents, upcomingEvents } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Name is not given" });
  }

  try {
    const newSport = new Sport({
      name,
      img,
      description,
      liveEvents,
      upcomingEvents,
    });

    const savedSport = await newSport.save();

    res
      .status(201)
      .json({ message: "Sport Uploaded Successfully", sport: savedSport });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateSport = async (req, res) => {
  const { name, img, description, liveEvents, upcomingEvents } = req.body;

  try {
    const updatedSport = await Sport.findByIdAndUpdate(
      req.params.id,
      {
        name,
        img,
        description,
        liveEvents,
        upcomingEvents,
      },
      { new: true }
    );

    if (!updatedSport)
      return res.status(404).json({ message: "Sport not found" });

    res.json({ message: "Sport Updated Successfully", sport: updatedSport });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteSport = async (req, res) => {
  try {
    const deletedSport = await Sport.findByIdAndDelete(req.params.id);

    if (!deletedSport)
      return res.status(404).json({ message: "Sport not found" });

    res.json({ message: "Sport Deleted Successfully", sport: deletedSport });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const findSport = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name)
      return res.status(400).json({ message: "Name query is required" });

    const sport = await Sport.findOne({ name });
    if (!sport) return res.status(404).json({ message: "Sport not found" });

    res.json(sport);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const findSports = async (req, res) => {
  try {
    const sports = await Sport.find();

    return res.json({ sports });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
