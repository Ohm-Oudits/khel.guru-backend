import mockUpiProvider from "./mockUpiProvider.js";
import razorpayProvider from "./razorpayProvider.js";

export const getPaymentProvider = (name) => {
  const key = String(
    name || process.env.PAYMENTS_DEFAULT_PROVIDER || "mock"
  ).trim();

  if (key === "mock") {
    return mockUpiProvider;
  }

  if (key === "razorpay") {
    return razorpayProvider;
  }

  const error = new Error(`Unsupported payment provider: ${key}`);
  error.statusCode = 400;
  throw error;
};
