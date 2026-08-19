import mongoose from "mongoose";

const payoutRequestSchema = new mongoose.Schema(
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
      enum: ["upi", "bank_transfer"],
      default: "upi",
    },
    destination: {
      vpa: { type: String, default: "", trim: true },
      accountNumber: { type: String, default: "", trim: true },
      ifsc: { type: String, default: "", uppercase: true, trim: true },
      accountHolderName: { type: String, default: "", trim: true },
    },
    status: {
      type: String,
      enum: [
        "requested",
        "under_review",
        "approved",
        "paid",
        "rejected",
        "failed",
      ],
      default: "requested",
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
    },
    provider: {
      type: String,
      default: "manual",
      trim: true,
    },
    providerRef: {
      type: String,
      default: null,
      trim: true,
    },
    holdLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    releaseLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    debitLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    review: {
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      reviewedAt: { type: Date, default: null },
      notes: { type: String, default: "", trim: true },
    },
    rejectedReason: {
      type: String,
      default: "",
      trim: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true, collection: "payout_requests" }
);

payoutRequestSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
payoutRequestSchema.index({ status: 1, createdAt: 1 });
payoutRequestSchema.index({ userId: 1, createdAt: -1 });

const PayoutRequest = mongoose.model("PayoutRequest", payoutRequestSchema);
export default PayoutRequest;
