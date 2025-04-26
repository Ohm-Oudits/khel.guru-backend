import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

const generateToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Sanitize user data before sending to frontend
const sanitizeUser = (user) => {
  const sanitizedUser = user.toObject();
  delete sanitizedUser.password;
  delete sanitizedUser.resetPasswordOTP;
  delete sanitizedUser.resetPasswordOTPExpiry;
  delete sanitizedUser.phoneOTP;
  delete sanitizedUser.phoneOTPExpiry;
  return sanitizedUser;
};

export const register = async (req, res) => {
  try {
    const { username, email, password, phoneNumber } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists" });

    const newUser = new User({ username, email, password, phoneNumber });
    await newUser.save();

    const token = generateToken(newUser);
    res.status(201).json({
      message: "User registered successfully",
      token,
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({
      $or: [{ email }, { username: email }],
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error });
  }
};

const generateUsername = async () => {
  let username;
  let isUnique = false;

  while (!isUnique) {
    const randomStr = Math.random().toString(36).substring(2, 12);
    username = randomStr;

    const existingUser = await User.findOne({ username });
    if (!existingUser) {
      isUnique = true;
    }
  }

  return username;
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

    const token = generateToken(user);
    res.json({ token, user: sanitizeUser(user) });
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

    const token = generateToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Telegram authentication failed", error });
  }
};

// **X (Twitter) Login/Signup**
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

    const token = generateToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: "X authentication failed", error });
  }
};

// instant registration
export const instantRegister = async (req, res) => {
  try {
    const generateUsername = async () => {
      let username;
      let isUnique = false;

      // Generate a completely random username
      while (!isUnique) {
        const randomStr = Math.random().toString(36).substring(2, 10); // Random string from numbers and letters
        username = randomStr;

        // Check if the username already exists
        const existingUser = await User.findOne({ username });
        if (!existingUser) {
          isUnique = true;
        }
      }

      return username;
    };

    const generatePassword = () => {
      const length = 12;
      const charset =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
      let password = "";
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
      }
      return password;
    };

    const username = await generateUsername();
    const password = generatePassword();

    const newUser = new User({ username, password });
    await newUser.save();

    const token = generateToken(newUser);
    res.status(201).json({
      message: "User registered successfully",
      token,
      user: sanitizeUser(newUser),
      credentials: { username, password },
    });
  } catch (error) {
    res.status(500).json({ message: "Error in instant registration", error });
  }
};

// Forgot Password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpiry = otpExpiry;
    await user.save();

    // Send OTP via email
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

// Verify OTP
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

    if (user.resetPasswordOTP !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.resetPasswordOTPExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Clear OTP after successful verification
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpiry = undefined;
    await user.save();

    res.json({ message: "OTP verified successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error verifying OTP", error });
  }
};

// Reset Password
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

// Verify Phone OTP
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

    if (user.phoneOTP !== otp) {
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

// Send Phone OTP
export const sendPhoneOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.phoneOTP = otp;
    user.phoneOTPExpiry = otpExpiry;
    await user.save();

    res.json({ message: "OTP sent to your phone", otp });
  } catch (error) {
    res.status(500).json({ message: "Error sending phone OTP", error });
  }
};

export const getUserData = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user data", error });
  }
};
