import AuditLog from "../models/auditLog.model.js";
import { getPaymentProvider } from "../services/paymentProviders/index.js";
import { settleDepositIntent } from "../services/paymentSettlement.service.js";

export const handlePaymentWebhook = async (req, res, next) => {
  try {
    let provider;
    try {
      provider = getPaymentProvider(req.params.provider);
    } catch {
      return res.status(404).json({ error: "Unknown payment provider" });
    }

    // req.body is the raw Buffer (express.raw) — required for exact-byte HMAC.
    if (!provider.verifyWebhook({ rawBody: req.body, headers: req.headers })) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    const event = provider.parseWebhookEvent(payload);

    if (event.type === "ignored") {
      return res.status(200).json({ received: true, ignored: true });
    }

    const result = await settleDepositIntent({
      provider: provider.key,
      providerRef: event.providerRef,
      providerPaymentId: event.providerPaymentId,
      outcome: event.type === "payment.succeeded" ? "success" : "failure",
      amountFromProvider: event.amount,
      source: "webhook",
    });

    if (result.unknown) {
      // Ack with 200 so the provider stops retrying; audit for reconciliation.
      await AuditLog.create({
        actorUserId: null,
        actorType: "system",
        action: "cashier.webhook.unknown_reference",
        entityType: "PaymentIntent",
        entityId: null,
        severity: "warn",
        metadata: { provider: provider.key, providerRef: event.providerRef },
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
};
