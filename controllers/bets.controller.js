import AuditLog from "../models/auditLog.model.js";
import Market from "../models/market.model.js";
import OddsSnapshot from "../models/oddsSnapshot.model.js";
import ResponsibleGamingLimit from "../models/responsibleGamingLimit.model.js";
import SelfExclusion from "../models/selfExclusion.model.js";
import SportsBet from "../models/sportsBet.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import { settleSingleBet } from "../services/betSettlement.service.js";
import { debitAvailable } from "../services/paymentSettlement.service.js";
import {
  createLedgerEntry,
  ensureDefaultWalletAccounts,
  mapWalletAccountsByType,
  normalizeAmount,
  serializeWalletAccount,
  syncLegacyBalance,
} from "../services/walletPlatform.service.js";

const roundMoney = (value) => Number(value.toFixed(2));

const createAuditLog = async (
  req,
  action,
  entityType,
  entityId,
  metadata = {}
) =>
  AuditLog.create({
    actorUserId: req.user._id,
    actorType: "user",
    action,
    entityType,
    entityId,
    severity: "info",
    ipAddress: req.ip,
    userAgent: req.get("User-Agent") || null,
    metadata,
  });

const getRequestedWalletType = (walletType) =>
  walletType === "demo" ? "demo" : "cash";

const getActiveSportsSelfExclusionQuery = (userId) => ({
  userId,
  status: "active",
  scope: { $in: ["sports", "all"] },
  $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
});

const getLatestSelectionOdds = async ({
  marketId,
  selectionKey,
  bookmakerKey = null,
}) => {
  const query = {
    marketId,
    "outcomes.key": selectionKey,
  };

  if (bookmakerKey) {
    query.bookmakerKey = bookmakerKey;
  }

  const latestSnapshot = await OddsSnapshot.findOne(query).sort({
    capturedAt: -1,
    createdAt: -1,
  });

  if (!latestSnapshot) {
    return null;
  }

  const outcome = latestSnapshot.outcomes.find(
    (entry) => entry.key === selectionKey
  );

  if (!outcome) {
    return null;
  }

  return {
    snapshot: latestSnapshot,
    outcome,
  };
};

export const placeSingleBet = async (req, res, next) => {
  try {
    if (req.user.accountStatus !== "active") {
      return res.status(403).json({
        message: "Your account is not eligible to place bets right now",
      });
    }

    const [activeSelfExclusion, responsibleGaming] = await Promise.all([
      SelfExclusion.findOne(getActiveSportsSelfExclusionQuery(req.user._id)),
      ResponsibleGamingLimit.findOne({ userId: req.user._id }),
    ]);

    if (activeSelfExclusion) {
      return res.status(403).json({
        message: "Sports betting is disabled while self-exclusion is active",
      });
    }

    if (
      responsibleGaming?.coolingOffUntil &&
      responsibleGaming.coolingOffUntil.getTime() > Date.now()
    ) {
      return res.status(403).json({
        message: "Cooling off period is active for this account",
        coolingOffUntil: responsibleGaming.coolingOffUntil,
      });
    }

    const amount = normalizeAmount(req.body.stake);

    if (!amount) {
      return res.status(400).json({ message: "Invalid stake amount" });
    }

    const event = await SportsEvent.findById(req.body.eventId);
    if (!event) {
      return res.status(404).json({ message: "Sports event not found" });
    }

    if (!["upcoming", "live"].includes(event.status)) {
      return res.status(400).json({ message: "This event is no longer open" });
    }

    const market = await Market.findOne({
      _id: req.body.marketId,
      eventId: event._id,
    });

    if (!market) {
      return res.status(404).json({ message: "Market not found" });
    }

    if (market.status !== "open") {
      return res.status(400).json({ message: "This market is not open" });
    }

    const selection = market.selections.find(
      (entry) => entry.key === req.body.selectionKey
    );

    if (!selection || selection.status !== "open") {
      return res.status(400).json({ message: "Selection is not available" });
    }

    const latestOdds = await getLatestSelectionOdds({
      marketId: market._id,
      selectionKey: selection.key,
      bookmakerKey: req.body.bookmakerKey || null,
    });

    if (!latestOdds) {
      return res.status(409).json({
        message: "Latest odds are not available for this selection",
      });
    }

    const currentPrice = roundMoney(latestOdds.outcome.priceDecimal);
    const expectedPrice = req.body.expectedPrice
      ? roundMoney(Number(req.body.expectedPrice))
      : null;
    const acceptOddsChange = req.body.acceptOddsChange === true;
    const acceptBetterOdds = req.body.acceptBetterOdds !== false;
    const tolerance = Number(process.env.ODDS_LOCK_TOLERANCE || 0);

    if (expectedPrice !== null && !acceptOddsChange) {
      const drifted = Math.abs(currentPrice - expectedPrice) > tolerance;
      const improved = currentPrice > expectedPrice;

      if (drifted && !(improved && acceptBetterOdds)) {
        return res.status(409).json({
          message: "Odds changed before the bet could be placed",
          expectedPrice,
          currentPrice,
        });
      }
    }

    const walletType = getRequestedWalletType(req.body.walletType);
    const walletAccounts = await ensureDefaultWalletAccounts(req.user._id);
    const accountsByType = mapWalletAccountsByType(walletAccounts);
    const walletAccount = accountsByType[walletType];

    if (!walletAccount) {
      return res.status(400).json({ message: "Wallet account not available" });
    }

    const debitedAccount = await debitAvailable(walletAccount._id, amount);
    if (!debitedAccount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    if (walletType === "cash") {
      await syncLegacyBalance(req.user._id, debitedAccount.availableBalance);
    }

    const potentialPayout = roundMoney(amount * currentPrice);

    const bet = await SportsBet.create({
      userId: req.user._id,
      eventId: event._id,
      marketId: market._id,
      walletAccountId: walletAccount._id,
      selectionKey: selection.key,
      selectionName: selection.name,
      selectionLine:
        latestOdds.outcome.line ?? selection.line ?? req.body.selectionLine ?? null,
      stake: amount,
      priceDecimal: currentPrice,
      potentialPayout,
      oddsSource: {
        bookmakerKey: latestOdds.snapshot.bookmakerKey,
        bookmakerTitle: latestOdds.snapshot.bookmakerTitle,
        capturedAt: latestOdds.snapshot.capturedAt,
      },
      metadata: {
        walletType,
        provider: market.provider,
        eventStatusAtPlacement: event.status,
        acceptOddsChange,
        acceptBetterOdds,
      },
    });

    const ledgerEntry = await createLedgerEntry({
      userId: req.user._id,
      walletAccountId: walletAccount._id,
      direction: "debit",
      category: "sports_bet",
      amount,
      balanceAfter: debitedAccount.availableBalance,
      description: `Sports bet placed on ${selection.name}`,
      referenceType: "SportsBet",
      referenceId: bet._id,
      metadata: {
        eventId: event._id,
        marketId: market._id,
        selectionKey: selection.key,
      },
    });

    await createAuditLog(req, "sports.bet.placed", "SportsBet", bet._id, {
      eventId: event._id,
      marketId: market._id,
      stake: amount,
      walletType,
      ledgerEntryId: ledgerEntry._id,
    });

    res.status(201).json({
      message: "Sports bet placed successfully",
      bet,
      account: serializeWalletAccount(debitedAccount),
      ledgerEntryId: ledgerEntry._id,
    });
  } catch (error) {
    next(error);
  }
};

export const getBetHistory = async (req, res, next) => {
  try {
    const filters = { userId: req.user._id };
    const limit = Number.parseInt(req.query.limit, 10);

    if (req.query.status) {
      filters.status = req.query.status;
    }

    const bets = await SportsBet.find(filters)
      .sort({ createdAt: -1 })
      .limit(Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 25)
      .populate("eventId", "sportKey sportName leagueName status startTime competitors")
      .populate("marketId", "title marketType provider providerMarketKey")
      .populate("walletAccountId", "walletType label currency")
      .lean();

    res.json({
      count: bets.length,
      bets,
    });
  } catch (error) {
    next(error);
  }
};

export const getBetById = async (req, res, next) => {
  try {
    const bet = await SportsBet.findOne({
      _id: req.params.betId,
      userId: req.user._id,
    })
      .populate("eventId", "sportKey sportName leagueName status startTime competitors")
      .populate("marketId", "title marketType provider providerMarketKey")
      .populate("walletAccountId", "walletType label currency")
      .lean();

    if (!bet) {
      return res.status(404).json({ message: "Bet not found" });
    }

    res.json({ bet });
  } catch (error) {
    next(error);
  }
};

export const settleBet = async (req, res, next) => {
  try {
    const result = req.body.result;

    if (!["won", "lost", "void"].includes(result)) {
      return res.status(400).json({
        message: "Settlement result must be won, lost, or void",
      });
    }

    const bet = await SportsBet.findById(req.params.betId);

    if (!bet) {
      return res.status(404).json({ message: "Bet not found" });
    }

    if (bet.settlementStatus !== "unsettled") {
      return res.status(400).json({ message: "Bet has already been settled" });
    }

    const outcome = await settleSingleBet({
      bet,
      result,
      actor: {
        type: "admin",
        userId: req.user._id,
        ip: req.ip,
        userAgent: req.get("User-Agent") || null,
      },
    });

    if (outcome.skipped) {
      if (outcome.reason === "wallet-not-found") {
        return res.status(404).json({ message: "Wallet account not found" });
      }
      return res.status(400).json({ message: "Bet has already been settled" });
    }

    res.json({
      message: "Sports bet settled successfully",
      bet: outcome.bet,
      account: serializeWalletAccount(outcome.account),
      ledgerEntryId: outcome.ledgerEntry?._id || null,
    });
  } catch (error) {
    next(error);
  }
};
