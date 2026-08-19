import mongoose from "mongoose";

const supportMessageSchema = new mongoose.Schema(
  {
    senderType: {
      type: String,
      enum: ["user", "agent", "system"],
      default: "user",
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["payments", "security", "kyc", "rewards", "casino", "sports", "general"],
      default: "general",
    },
    status: {
      type: String,
      enum: ["open", "in_review", "resolved", "closed"],
      default: "open",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    latestMessage: {
      type: String,
      default: "",
      trim: true,
    },
    messages: {
      type: [supportMessageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1, updatedAt: -1 });

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
export default SupportTicket;
