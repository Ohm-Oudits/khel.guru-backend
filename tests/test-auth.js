import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_URL = process.env.API_URL || "http://localhost:8080/api";

const testUser = {
  username: "testuser",
  email: "test@example.com",
  password: "Test123!",
  phoneNumber: "+1234567890",
};

let authToken = "";

const testAPIs = async () => {
  try {
    console.log("Starting API tests...\n");

    // Test Registration
    console.log("Testing Registration...");
    const registerResponse = await axios.post(
      `${API_URL}/users/register`,
      testUser
    );
    console.log("Registration Response:", registerResponse.data);
    console.log("Registration Test Passed!\n");

    // Test Login
    console.log("Testing Login...");
    const loginResponse = await axios.post(`${API_URL}/users/login`, {
      email: testUser.email,
      password: testUser.password,
    });
    authToken = loginResponse.data.token;
    console.log("Login Response:", loginResponse.data);
    console.log("Login Test Passed!\n");

    // Test Forgot Password
    console.log("Testing Forgot Password...");
    const forgotPasswordResponse = await axios.post(
      `${API_URL}/users/forgot-password`,
      {
        email: testUser.email,
      }
    );
    console.log("Forgot Password Response:", forgotPasswordResponse.data);
    console.log("Forgot Password Test Passed!\n");

    // Test Verify OTP (using the OTP from the response)
    console.log("Testing Verify OTP...");
    const verifyOTPResponse = await axios.post(`${API_URL}/users/verify-otp`, {
      email: testUser.email,
      otp: forgotPasswordResponse.data.otp,
    });
    console.log("Verify OTP Response:", verifyOTPResponse.data);
    console.log("Verify OTP Test Passed!\n");

    // Test Reset Password
    console.log("Testing Reset Password...");
    const resetPasswordResponse = await axios.post(
      `${API_URL}/users/reset-password`,
      {
        email: testUser.email,
        newPassword: "NewTest123!",
      }
    );
    console.log("Reset Password Response:", resetPasswordResponse.data);
    console.log("Reset Password Test Passed!\n");

    // Test Send Phone OTP
    console.log("Testing Send Phone OTP...");
    const sendPhoneOTPResponse = await axios.post(
      `${API_URL}/users/send-phone-otp`,
      {
        phoneNumber: testUser.phoneNumber,
      }
    );
    console.log("Send Phone OTP Response:", sendPhoneOTPResponse.data);
    console.log("Send Phone OTP Test Passed!\n");

    // Test Verify Phone OTP
    console.log("Testing Verify Phone OTP...");
    const verifyPhoneOTPResponse = await axios.post(
      `${API_URL}/users/verify-phone-otp`,
      {
        phoneNumber: testUser.phoneNumber,
        otp: sendPhoneOTPResponse.data.otp,
      }
    );
    console.log("Verify Phone OTP Response:", verifyPhoneOTPResponse.data);
    console.log("Verify Phone OTP Test Passed!\n");

    // Test Google Auth
    console.log("Testing Google Auth...");
    const googleAuthResponse = await axios.post(
      `${API_URL}/users/google-auth`,
      {
        googleId: "test-google-id",
        email: "google@example.com",
      }
    );
    console.log("Google Auth Response:", googleAuthResponse.data);
    console.log("Google Auth Test Passed!\n");

    // Test Telegram Auth
    console.log("Testing Telegram Auth...");
    const telegramAuthResponse = await axios.post(
      `${API_URL}/users/telegram-auth`,
      {
        telegramId: "test-telegram-id",
      }
    );
    console.log("Telegram Auth Response:", telegramAuthResponse.data);
    console.log("Telegram Auth Test Passed!\n");

    // Test X Auth
    console.log("Testing X Auth...");
    const xAuthResponse = await axios.post(`${API_URL}/users/x-auth`, {
      xId: "test-x-id",
    });
    console.log("X Auth Response:", xAuthResponse.data);
    console.log("X Auth Test Passed!\n");

    console.log("All API tests completed successfully!");
  } catch (error) {
    console.log(error);
    console.error(
      "Error during API testing:",
      error.response?.data || error.message
    );
  }
};

testAPIs();
