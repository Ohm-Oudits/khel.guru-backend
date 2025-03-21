// ---  /api/user/ -----
import express from "express";
import {
  fetchUser,
  login,
  register,
  googleAuth,
  postForgotPassword,
  restPassword,
  verifyForgotPassword,
  sendOtp,
  verifyOtp,
  updatePassword,
  instantReg,
  telegramAuth,
  xAuth,
} from "../controllers/user.controllers.js";
import { verifyUserToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

// for verifying the route
router.get("/", verifyUserToken, fetchUser);

// auth routes
router.post("/login", login);
router.post("/register", register);
router.post("/login/google-auth", googleAuth);
router.post("/telegram-auth", telegramAuth);
router.post("/x-auth", xAuth);
router.post("/instant-reg", instantReg);

// password - crud routes
router.patch("/edit/password", verifyUserToken, updatePassword);
router.post("/recover/password", postForgotPassword);
router.post("/verify/password", verifyForgotPassword);
router.post("/reset/password", verifyUserToken, restPassword);

// otp routes
router.post("/send/otp", sendOtp);
router.post("/verify/otp", verifyOtp);

export default router;
