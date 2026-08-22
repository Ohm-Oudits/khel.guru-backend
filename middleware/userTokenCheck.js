import jwt from "jsonwebtoken";
import AuthSession from "../models/authSession.model.js";
import User from "../models/user.model.js";
import {
  isSessionExpired,
  touchAuthSession,
} from "../services/authSession.service.js";

export const verifyToken = async (req, res, next) => {
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

    const user = await User.findById(decodedToken.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (decodedToken.sid) {
      const authSession = await AuthSession.findById(decodedToken.sid);

      if (
        !authSession ||
        authSession.status !== "active" ||
        authSession.revokedAt ||
        isSessionExpired(authSession)
      ) {
        return res.status(401).json({ message: "Session is no longer active" });
      }

      req.authSession = authSession;
      await touchAuthSession(authSession._id);
    }

    req.user = user;
    next();
  } catch (error) {
    console.log(error.message);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export const optionalToken = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return verifyToken(req, res, next);
};
