import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import User from "../models/user.model.js";
import { revokeAuthSession, createAuthSession } from "../services/authSession.service.js";
import { ensureDefaultWalletAccounts } from "../services/walletPlatform.service.js";

dotenv.config();

const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS || 7);
const REMEMBER_ME_SESSION_DAYS = Number(
  process.env.REMEMBER_ME_SESSION_DAYS || 30
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const generateOTP = () => Math.floor(100000 + Math.random() * 900000);

const generateToken = (user, session, rememberMe = false) => {
  const expiresIn = rememberMe
    ? `${REMEMBER_ME_SESSION_DAYS}d`
    : `${SESSION_MAX_AGE_DAYS}d`;

  return jwt.sign(
    { id: user._id, sid: session?._id?.toString?.() || null },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

const sanitizeUser = (user) => {
  const sanitizedUser = user.toObject();
  delete sanitizedUser.password;
  delete sanitizedUser.resetPasswordOTP;
  delete sanitizedUser.resetPasswordOTPExpiry;
  delete sanitizedUser.phoneOTP;
  delete sanitizedUser.phoneOTPExpiry;
  return sanitizedUser;
};

const sanitizeSession = (session) => ({
  id: session._id,
  authMethod: session.authMethod,
  status: session.status,
  rememberMe: session.rememberMe,
  lastSeenAt: session.lastSeenAt,
  expiresAt: session.expiresAt,
  ipAddress: session.ipAddress,
  userAgent: session.userAgent,
  deviceLabel: session.deviceLabel,
});

const generateUsername = async (length = 10) => {
  let username;
  let isUnique = false;

  while (!isUnique) {
    username = Math.random().toString(36).substring(2, 2 + length);
    const existingUser = await User.findOne({ username });

    if (!existingUser) {
      isUnique = true;
    }
  }

  return username;
};

const issueAuthResponse = async ({
  req,
  res,
  user,
  authMethod,
  rememberMe = false,
  statusCode = 200,
  message,
  extra = {},
}) => {
  user.lastLoginAt = new Date();
  await user.save();

  // Idempotent upsert: guarantees wallet accounts exist from the first auth
  // response onward instead of lazily on first wallet touch.
  await ensureDefaultWalletAccounts(user._id);

  const session = await createAuthSession({
    user,
    req,
    authMethod,
    rememberMe,
  });

  const token = generateToken(user, session, rememberMe);

  return res.status(statusCode).json({
    ...(message ? { message } : {}),
    token,
    session: sanitizeSession(session),
    user: sanitizeUser(user),
    ...extra,
  });
};

export const register = async (req, res) => {
  try {
    const { username, email, password, phoneNumber } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const newUser = new User({ username, email, password, phoneNumber });
    await newUser.save();

    return issueAuthResponse({
      req,
      res,
      user: newUser,
      authMethod: "password",
      statusCode: 201,
      message: "User registered successfully",
    });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password, rememberMe = false } = req.body;

    const user = await User.findOne({
      $or: [{ email }, { username: email }],
    });

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    return issueAuthResponse({
      req,
      res,
      user,
      authMethod: "password",
      rememberMe,
    });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error });
  }
};

export const googleAuth = async (req, res) => {
  try {
    const { googleId, email } = req.body;
    let user = await User.findOne({ googleId });

    if (!user) {
      const username = await generateUsername();
      user = new User({
        googleId,
        email,
        username,
        emailVerified: true,
      });
      await user.save();
    }

    return issueAuthResponse({
      req,
      res,
      user,
      authMethod: "google",
    });
  } catch (error) {
    res.status(500).json({ message: "Google authentication failed", error });
  }
};

export const telegramAuth = async (req, res) => {
  try {
    const { telegramId } = req.body;
    let user = await User.findOne({ telegramId });

    if (!user) {
      const username = await generateUsername();
      user = new User({
        telegramId,
        username,
      });
      await user.save();
    }

    return issueAuthResponse({
      req,
      res,
      user,
      authMethod: "telegram",
    });
  } catch (error) {
    res.status(500).json({ message: "Telegram authentication failed", error });
  }
};

export const xAuth = async (req, res) => {
  try {
    const { xId } = req.body;
    let user = await User.findOne({ xId });

    if (!user) {
      const username = await generateUsername();
      user = new User({
        xId,
        username,
      });
      await user.save();
    }

    return issueAuthResponse({
      req,
      res,
      user,
      authMethod: "x",
    });
  } catch (error) {
    res.status(500).json({ message: "X authentication failed", error });
  }
};

export const instantRegister = async (req, res) => {
  try {
    const generatePassword = () => {
      const length = 12;
      const charset =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
      let password = "";

      for (let i = 0; i < length; i += 1) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
      }

      return password;
    };

    const username = await generateUsername(8);
    const password = generatePassword();

    const newUser = new User({ username, password });
    await newUser.save();

    return issueAuthResponse({
      req,
      res,
      user: newUser,
      authMethod: "instant",
      statusCode: 201,
      message: "User registered successfully",
      extra: {
        credentials: { username, password },
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error in instant registration", error });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.resetPasswordOTP = String(otp);
    user.resetPasswordOTPExpiry = otpExpiry;
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP for password reset is: ${otp}. Valid for 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "OTP sent to your email" });
  } catch (error) {
    res.status(500).json({ message: "Error in forgot password", error });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.resetPasswordOTP || !user.resetPasswordOTPExpiry) {
      return res.status(400).json({ message: "No OTP request found" });
    }

    if (user.resetPasswordOTP !== String(otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.resetPasswordOTPExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpiry = undefined;
    await user.save();

    res.json({ message: "OTP verified successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error verifying OTP", error });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error resetting password", error });
  }
};

export const sendPhoneOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.phoneOTP = String(otp);
    user.phoneOTPExpiry = otpExpiry;
    await user.save();

    res.json({ message: "OTP sent to phone number" });
  } catch (error) {
    res.status(500).json({ message: "Error sending phone OTP", error });
  }
};

export const verifyPhoneOTP = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.phoneOTP || !user.phoneOTPExpiry) {
      return res.status(400).json({ message: "No OTP request found" });
    }

    if (user.phoneOTP !== String(otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.phoneOTPExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    user.phoneNumberVerified = true;
    user.phoneOTP = undefined;
    user.phoneOTPExpiry = undefined;
    await user.save();

    res.json({ message: "Phone number verified successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error verifying phone OTP", error });
  }
};

export const getUserData = async (req, res) => {
  try {
    res.json({ user: sanitizeUser(req.user) });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user data", error });
  }
};

export const logout = async (req, res) => {
  try {
    if (req.authSession?._id) {
      await revokeAuthSession(req.authSession._id);
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error logging out", error });
  }
};
