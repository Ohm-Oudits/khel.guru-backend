import {
  getSlot,
  launchSlot,
  listSlots,
  spinSlot,
} from "../services/slotsCatalog.service.js";

export const listCasinoSlots = async (req, res) => {
  try {
    const games = await listSlots({ provider: req.query.provider });
    return res.json({
      provider: req.query.provider || "sandbox",
      count: games.length,
      games,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getCasinoSlot = async (req, res) => {
  try {
    const game = await getSlot(req.params.slug);
    if (!game) return res.status(404).json({ message: "Slot not found" });
    return res.json({ game });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const launchCasinoSlot = async (req, res) => {
  try {
    const launch = await launchSlot(req.params.slug, {
      mode: req.body?.mode || "demo",
    });
    if (!launch) return res.status(404).json({ message: "Slot not found" });
    return res.json({ launch });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const spinCasinoSlot = async (req, res) => {
  try {
    const result = await spinSlot(req.params.slug, {
      betAmount: req.body?.betAmount,
      walletType: req.body?.walletType || "demo",
      userId: req.user?._id || null,
    });
    if (result.error) {
      return res.status(result.status || 400).json({ message: result.error });
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Seamless-wallet stubs. A real aggregator posts these; we keep the
// contract visible without moving money until a partner is wired.
export const sandboxWalletBalance = (_req, res) => {
  return res.json({
    status: "sandbox",
    balance: 0,
    currency: "INR",
    message: "Sandbox only. Wire a partner seamless wallet next.",
  });
};

export const sandboxWalletNoop = (req, res) => {
  return res.json({
    status: "sandbox",
    action: req.path.split("/").pop(),
    accepted: false,
    message: "Sandbox only. Bet/win/rollback are not live yet.",
  });
};
