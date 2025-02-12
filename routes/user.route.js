import express from "express";
import {
  fetchUser,
  userLogin,
  userRegister,
  userGoogleLogin,
  postForgotPassword,
  resPassword,
  verifyForgotPassword,
  sendOtp,
  verifyOtp,
  updatePassword,
} from "../controllers/user.controllers.js";
import { verifyUserToken } from "../middleware/userTokenCheck.js";

const router = express.Router();

router.get("/", verifyUserToken, fetchUser);
router.post("/login", userLogin);
router.post("/login/google", userGoogleLogin);
router.post("/register", userRegister);
router.patch("/edit/password", verifyUserToken, updatePassword);

router.post("/recover/password", postForgotPassword);
router.post("/verify/password", verifyForgotPassword);
router.post("/reset/password", verifyUserToken, resPassword);

router.post("/send/otp", sendOtp);
router.post("/verify/otp", verifyOtp);

export default router;
