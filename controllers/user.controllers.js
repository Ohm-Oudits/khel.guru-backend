import User from "../models/user.model.js";
import ForgotPassword from "../models/forgotPassword.model.js";
import Otp from "../models/otp.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateToken } from "../utils/jwt.js";

export const fetchUser = async (req, res) => {
  const userId = req.user;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userResponse = {
      ...user._doc,
      password: undefined,
    };

    return res.status(200).json({ user: userResponse });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// **Manual Login**
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = generateToken(user);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error });
  }
};

// **Manual Registration**
export const register = async (req, res) => {
  try {
    const { username, email, password, phoneNumber } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists" });
    const newUser = new User({ username, email, password, phoneNumber });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
};

// **Google Login/Signup**
export const googleAuth = async (req, res) => {
  try {
    const { googleId, email, username } = req.body;
    let user = await User.findOne({ googleId });
    if (!user) {
      user = new User({ googleId, email, username, emailVerified: true });
      await user.save();
    }
    const token = generateToken(user);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Google authentication failed", error });
  }
};

// **Telegram Login/Signup**
export const telegramAuth = async (req, res) => {
  try {
    const { telegramId, username } = req.body;
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({ telegramId, username });
      await user.save();
    }
    const token = generateToken(user);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Telegram authentication failed", error });
  }
};

// **X (Twitter) Login/Signup**
export const xAuth = async (req, res) => {
  try {
    const { xId, username } = req.body;
    let user = await User.findOne({ xId });
    if (!user) {
      user = new User({ xId, username });
      await user.save();
    }
    const token = generateToken(user);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "X authentication failed", error });
  }
};

// **Instant Registration Function**
export const instantReg = async (req, res) => {
  try {
    // Generate random username and password
    const username = `user_${cryptoRandomString({
      length: 8,
      type: "alphanumeric",
    })}`;
    const password = cryptoRandomString({ length: 12, type: "alphanumeric" });
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create a new user
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    // Generate JWT token
    const token = generateToken(newUser);
    res.json({ token, user: { username, password } }); // Return credentials
  } catch (error) {
    res.status(500).json({ message: "Instant registration failed", error });
  }
};

export const updatePassword = async (req, res) => {
  const userId = req.user;
  const { password, oldPassword } = req.body;

  try {
    if (!username || username.trim() === "") {
      return res.status(400).json({ message: "Username is required" });
    }

    if (!oldPassword || !password) {
      return res.status(400).json({ message: "All Fields are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isOldPasswordCorrect = await bcrypt.compare(
      oldPassword,
      user.password
    );
    if (!isOldPasswordCorrect) {
      return res.status(400).json({ message: "Invalid User Old Password" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.password = hashedPassword;
    const updatedUser = await user.save();

    if (updatedUser) {
      return res.status(200).json({ message: "Profile Updated Successfully" });
    }

    return res.status(404).json({ message: "User Not Found" });
  } catch (err) {
    console.error("Error during profile update:", err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// sending otp
export const sendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const otp = crypto.randomInt(10000, 99999).toString();

    const existingOtp = await Otp.findOne({ email: email.toLowerCase() });
    if (existingOtp) {
      existingOtp.otp = otp;
      await existingOtp.save();
    } else {
      const newOtp = new Otp({ email: email.toLowerCase(), otp });
      await newOtp.save();
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "sivahere9484@gmail.com",
        pass: process.env.PASSWORD,
      },
    });

    const mailOptions = {
      from: {
        name: "OTP Verification",
        address: "sivahere9484@gmail.com",
      },
      to: email.split(",").map((email) => email.trim()),
      subject: "Email Verfication of Loosers World",
      html: `
        <>
          <h1>${otp}</h1>
        </>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ message: "OTP sent to email successfully" });
  } catch (err) {
    console.error("Error while sending OTP:", err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// verify otp
export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  try {
    const existingOtp = await Otp.findOne({ email: email.toLowerCase() });

    if (!existingOtp) {
      return res.status(401).json({ message: "OTP expired or not found" });
    }

    if (existingOtp.otp !== otp) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    await Otp.deleteOne({ email: email.toLowerCase() });

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("Error during OTP verification:", err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// forgot password
export const postForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (!emailExists) {
      return res.status(409).json({ message: "User Doesn't exists" });
    }

    const otp = crypto.randomInt(10000, 99999).toString();

    const existingOtp = await ForgotPassword.findOne({
      email: email.toLowerCase(),
    });

    if (existingOtp) {
      existingOtp.otp = otp;
      await existingOtp.save();
    } else {
      const newOtp = new ForgotPassword({ email: email.toLowerCase(), otp });
      await newOtp.save();
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "sivahere9484@gmail.com",
        pass: process.env.PASSWORD,
      },
    });

    const mailOptions = {
      from: {
        name: "Girls Grevience Password Recovery",
        address: "sivahere9484@gmail.com",
      },
      to: email.split(",").map((email) => email.trim()),
      subject: "Password Verification of Girl Grievance",
      html: `
        <>
          <h1>${otp}</h1>
        </>
      `,
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ message: "OTP sent to email successfully" });
  } catch (err) {
    console.error("Error while sending OTP:", err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// verify forgotpassword
export const verifyForgotPassword = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  try {
    const existingOtp = await ForgotPassword.findOne({
      email: email.toLowerCase(),
    });

    if (!existingOtp) {
      return res.status(401).json({ message: "OTP expired or not found" });
    }

    if (existingOtp.otp !== otp) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    await ForgotPassword.deleteOne({ email: email.toLowerCase() });
    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    return res
      .status(200)
      .json({ message: "OTP verified successfully", token });
  } catch (err) {
    console.error("Error during OTP verification:", err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const restPassword = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!password || !email) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const editUser = await User.findOneAndUpdate(
      { email },
      { password: hashedPassword }
    );
    if (!editUser) {
      return res.status(400).json({ message: "Error Upadating Passwords" });
    }

    return res.status(200).json({ message: "User Updated Successfully" });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ message: "Internal Sever Error" });
  }
};
