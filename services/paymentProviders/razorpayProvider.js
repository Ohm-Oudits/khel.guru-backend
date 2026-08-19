import axios from "axios";
import crypto from "crypto";

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";

const getCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  return { keyId, keySecret };
};

const safeEqual = (expected, provided) => {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(String(provided || ""), "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

const createDepositOrder = async ({ intent }) => {
  const { keyId, keySecret } = getCredentials();

  const response = await axios.post(
    `${RAZORPAY_API_BASE_URL}/orders`,
    {
      // Razorpay amounts are integer paise.
      amount: Math.round(intent.amount * 100),
      currency: intent.currency,
      receipt: String(intent._id),
      notes: {
        intentId: String(intent._id),
        userId: String(intent.userId),
      },
    },
    {
      auth: { username: keyId, password: keySecret },
      timeout: 8000,
    }
  );

  return {
    providerRef: response.data.id,
    checkout: {
      mode: "razorpay_checkout",
      keyId,
      orderId: response.data.id,
      amount: response.data.amount,
      currency: response.data.currency,
    },
  };
};

const verifyWebhook = ({ rawBody, headers }) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = headers["x-razorpay-signature"];

  if (!secret || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return safeEqual(expected, signature);
};

const parseWebhookEvent = (body) => {
  const paymentEntity = body?.payload?.payment?.entity;

  if (body?.event === "payment.captured" && paymentEntity) {
    return {
      type: "payment.succeeded",
      providerRef: paymentEntity.order_id,
      providerPaymentId: paymentEntity.id,
      amount: paymentEntity.amount / 100,
      failureReason: "",
    };
  }

  if (body?.event === "payment.failed" && paymentEntity) {
    return {
      type: "payment.failed",
      providerRef: paymentEntity.order_id,
      providerPaymentId: paymentEntity.id,
      amount: paymentEntity.amount / 100,
      failureReason:
        paymentEntity.error_description || paymentEntity.error_code || "payment_failed",
    };
  }

  return { type: "ignored" };
};

const razorpayProvider = {
  key: "razorpay",
  createDepositOrder,
  verifyWebhook,
  parseWebhookEvent,
};

export default razorpayProvider;
