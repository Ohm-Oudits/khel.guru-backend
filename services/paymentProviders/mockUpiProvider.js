import crypto from "crypto";

const MOCK_PAYEE_VPA = "khelguru@mockupi";
export const MOCK_SUCCESS_VPA = "success@mock";
export const MOCK_FAILURE_VPA = "failure@mock";

const getWebhookSecret = () =>
  process.env.MOCK_PAYMENTS_WEBHOOK_SECRET || "dev-mock-secret";

const signPayload = (rawBody) =>
  crypto.createHmac("sha256", getWebhookSecret()).update(rawBody).digest("hex");

const safeEqual = (expected, provided) => {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(String(provided || ""), "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

const createDepositOrder = async ({ intent }) => {
  const providerRef = `mockpay_${crypto.randomUUID()}`;
  const intentUrl = `upi://pay?pa=${MOCK_PAYEE_VPA}&pn=KhelGuru&am=${intent.amount.toFixed(
    2
  )}&cu=${intent.currency}&tr=${providerRef}`;

  return {
    providerRef,
    checkout: {
      mode: "mock_upi",
      payeeVpa: MOCK_PAYEE_VPA,
      intentUrl,
      successVpa: MOCK_SUCCESS_VPA,
      failureVpa: MOCK_FAILURE_VPA,
    },
  };
};

const verifyWebhook = ({ rawBody, headers }) => {
  const signature = headers["x-mock-signature"];

  if (!signature) {
    return false;
  }

  return safeEqual(signPayload(rawBody), signature);
};

const parseWebhookEvent = (body) => {
  if (body?.event === "payment.succeeded") {
    return {
      type: "payment.succeeded",
      providerRef: body.providerRef,
      providerPaymentId: body.paymentId || null,
      amount: typeof body.amount === "number" ? body.amount : null,
      failureReason: "",
    };
  }

  if (body?.event === "payment.failed") {
    return {
      type: "payment.failed",
      providerRef: body.providerRef,
      providerPaymentId: body.paymentId || null,
      amount: typeof body.amount === "number" ? body.amount : null,
      failureReason: body.reason || "payment_failed",
    };
  }

  return { type: "ignored" };
};

// Test/CLI helper: produce a delivery-ready signed webhook for a mock intent.
export const buildSignedMockWebhook = ({
  providerRef,
  outcome = "success",
  amount = null,
  paymentId = null,
}) => {
  const body = JSON.stringify({
    event: outcome === "success" ? "payment.succeeded" : "payment.failed",
    providerRef,
    paymentId: paymentId || `mockpayment_${crypto.randomUUID()}`,
    ...(amount === null ? {} : { amount }),
    ...(outcome === "success" ? {} : { reason: "simulated_failure" }),
  });

  return {
    body,
    signature: signPayload(body),
  };
};

const mockUpiProvider = {
  key: "mock",
  createDepositOrder,
  verifyWebhook,
  parseWebhookEvent,
};

export default mockUpiProvider;
