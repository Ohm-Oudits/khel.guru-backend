import {
  getLiveTable,
  launchLive,
  listLive,
  playLive,
} from "../services/liveCatalog.service.js";

export const listCasinoLive = async (req, res) => {
  try {
    const games = await listLive();
    return res.json({
      provider: "sandbox-live",
      count: games.length,
      games,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getCasinoLive = async (req, res) => {
  try {
    const game = await getLiveTable(req.params.slug);
    if (!game) return res.status(404).json({ message: "Live table not found" });
    return res.json({ game });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const launchCasinoLive = async (req, res) => {
  try {
    const launch = await launchLive(req.params.slug, {
      mode: req.body?.mode || "demo",
    });
    if (!launch) return res.status(404).json({ message: "Live table not found" });
    return res.json({ launch });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const playCasinoLive = async (req, res) => {
  try {
    const result = await playLive(req.params.slug, {
      betAmount: req.body?.betAmount,
      selection: req.body?.selection,
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
