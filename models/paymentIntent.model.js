import mongoose from "mongoose";

const paymentIntentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    walletAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletAccount",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    method: {
      type: String,
      enum: ["upi", "bank_transfer", "card"],
      default: "upi",
    },
    provider: {
      type: String,
      required: true,
      trim: true,
    },
    providerRef: {
      type: String,
      default: null,
      trim: true,
    },
    providerPaymentId: {
      type: String,
      default: null,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["created", "processing", "succeeded", "failed", "expired"],
      default: "created",
      index: true,
    },
    failureReason: {
      type: String,
      default: "",
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    upi: {
      payerVpa: { type: String, default: "", trim: true },
      payeeVpa: { type: String, default: "", trim: true },
      intentUrl: { type: String, default: "", trim: true },
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    ledgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    creditedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true, collection: "payment_intents" }
);

paymentIntentSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
paymentIntentSchema.index(
  { provider: 1, providerRef: 1 },
  {
    unique: true,
    partialFilterExpression: { providerRef: { $type: "string" } },
  }
);
paymentIntentSchema.index({ userId: 1, createdAt: -1 });
paymentIntentSchema.index({ status: 1, expiresAt: 1 });

const PaymentIntent = mongoose.model("PaymentIntent", paymentIntentSchema);
export default PaymentIntent;
