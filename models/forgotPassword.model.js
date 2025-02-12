import mongoose from "mongoose";

const EmailVerifcationSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 },
});

const forgotPassword = mongoose.model("ForgotPassword", EmailVerifcationSchema);
export default forgotPassword;
