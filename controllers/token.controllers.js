import Token from "../models/token.model";

export const createToken = async (req, res) => {
  const userId = req.user?.id;

  try {
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user ID found." });
    }

    const { name, marketCap, desc, img, website, twitter, discord, telegram } =
      req.body;

    if (!name || !marketCap) {
      return res
        .status(400)
        .json({ message: "Name and Market Cap are required fields." });
    }

    const newToken = await Token.create({
      userId,
      name,
      marketCap,
      desc,
      img,
      website,
      twitter,
      discord,
      telegram,
    });

    res.status(201).json({
      message: "Token created successfully",
      token: newToken,
    });
  } catch (error) {
    console.error("Token creation error:", error);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};
