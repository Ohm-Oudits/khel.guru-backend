import express from "express";
import { handlePaymentWebhook } from "../controllers/webhooks.controller.js";

const router = express.Router();

// Raw body is required so provider HMAC signatures verify against exact bytes.
// This router must be mounted BEFORE the global JSON body parsers.
router.post(
  "/payments/:provider",
  express.raw({ type: "*/*", limit: "1mb" }),
  handlePaymentWebhook
);

export default router;
