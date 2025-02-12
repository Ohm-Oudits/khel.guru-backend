import User from "../models/user.model.js";
import ForgotPassword from "../models/forgotPassword.model.js";
import Otp from "../models/otp.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

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

export const userLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!password || !email) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const emailRegex = /.+@.+\..+/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "Invalid Credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(404).json({ message: "Invalid Credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

    const userResponse = {
      ...user._doc,
      password: undefined,
    };

    return res.status(200).json({ user: userResponse, token, role: "User" });
  } catch (error) {
    console.error("Error during User login:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const userGoogleLogin = async (req, res) => {
  const { email, secret } = req.body;

  try {
    if (!email || !secret) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    if (email.slice(0, 10).toLowerCase() !== secret) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: "Invalid Credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

    const userResponse = {
      ...user._doc,
      password: undefined,
    };

    return res.status(200).json({ user: userResponse, token, role: "User" });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const userRegister = async (req, res) => {
  const { username, password, phno, email } = req.body;

  try {
    if (!username || !password || !phno || !email) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const emailRegex = /.+@.+\..+/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with this email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      username: username.toUpperCase(),
      email: email.toLowerCase(),
      phno,
      password: hashedPassword,
    });

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET);

    const userResponse = {
      ...newUser._doc,
      password: undefined,
    };

    return res.status(201).json({ user: userResponse, token, role: "User" });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: "Validation Error", errors });
    }

    console.error("Error during admin registration:", error);
    return res.status(500).json({ message: "Internal Server Error" });
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

export const resPassword = async (req, res) => {
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
