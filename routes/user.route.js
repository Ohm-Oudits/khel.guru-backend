import express from "express";
import {
  register,
  login,
  googleAuth,
  telegramAuth,
  xAuth,
  forgotPassword,
  verifyOTP,
  resetPassword,
  sendPhoneOTP,
  verifyPhoneOTP,
  getUserData,
  instantRegister,
} from "../controllers/user.controllers.js";
import { verifyToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

// Authentication routes
router.post("/register", register);
router.post("/instant-register", instantRegister);
router.post("/login", login);
router.post("/google-auth", googleAuth);
router.post("/telegram-auth", telegramAuth);
router.post("/x-auth", xAuth);
router.post("/instant-register", instantRegister);

// Password reset routes
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", resetPassword);

// Phone verification routes
router.post("/send-phone-otp", sendPhoneOTP);
router.post("/verify-phone-otp", verifyPhoneOTP);

// Protected routes
router.get("/me", verifyToken, getUserData);

export default router;
