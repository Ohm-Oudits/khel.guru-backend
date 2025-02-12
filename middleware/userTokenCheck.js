import jwt from "jsonwebtoken";

export const verifyUserToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Authorization header missing" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token not provided" });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    if (!decodedToken) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = decodedToken.userId;
    next();
  } catch (error) {
    console.log(error.message);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
