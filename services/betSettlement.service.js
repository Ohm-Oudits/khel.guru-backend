import AuditLog from "../models/auditLog.model.js";
import Market from "../models/market.model.js";
import SportsBet from "../models/sportsBet.model.js";
import SportsEvent from "../models/sportsEvent.model.js";
import WalletAccount from "../models/walletAccount.model.js";
import {
  emitBetSettled,
  emitEventState,
  emitMarketSuspended,
} from "../socket/modules/sports/sports.emitter.js";
import { normalizeSelectionKey } from "./sportsbookProviders/theOddsApiProvider.js";
import {
  createLedgerEntry,
  serializeWalletAccount,
  syncLegacyBalance,
} from "./walletPlatform.service.js";

const roundMoney = (value) => Number(value.toFixed(2));

const stripLineSuffix = (key) =>
  String(key).replace(/_-?[0-9]+(\.[0-9]+)?$/, "");

const parseLineFromKey = (key) => {
  const match = String(key).match(/_(-?[0-9]+(?:\.[0-9]+)?)$/);
  return match ? Number(match[1]) : null;
};

const recordSettlementAudit = async ({ actor, action, betId, metadata }) =>
  AuditLog.create({
    actorUserId: actor?.userId || null,
    actorType: actor?.type === "system" ? "system" : "user",
    action,
    entityType: "SportsBet",
    entityId: betId,
    severity: "info",
    ipAddress: actor?.ip || null,
    userAgent: actor?.userAgent || null,
    metadata,
  });

// Pure result determination from a final scoreboard. The cardinal rule:
// anything we cannot match confidently is VOID (refund), never a guess.
export const determineSelectionResult = ({ market, selection, event }) => {
  const scoreboard = event?.scoreboard || {};
  const home = Number(scoreboard.home);
  const away = Number(scoreboard.away);

  if (!Number.isFinite(home) || !Number.isFinite(away)) {
    return "void";
  }

  const marketType = market?.marketType || "other";

  const competitors = event?.competitors || [];
  const homeName = competitors.find((entry) => entry.role === "home")?.name;
  const awayName = competitors.find((entry) => entry.role === "away")?.name;
  const homeKey = homeName ? normalizeSelectionKey(homeName) : null;
  const awayKey = awayName ? normalizeSelectionKey(awayName) : null;

  if (marketType === "h2h") {
    if (selection.key === "draw") {
      return home === away ? "won" : "lost";
    }

    const key = stripLineSuffix(selection.key);
    const isHome = homeKey !== null && key === homeKey;
    const isAway = awayKey !== null && key === awayKey;

    if (!isHome && !isAway) {
      return "void";
    }

    if (home === away) {
      const drawOffered = (market?.selections || []).some(
        (entry) => entry.key === "draw"
      );
      // Tie with a draw selection: the team bet simply lost. Tie without a
      // draw selection (cricket tie / no-result): refund.
      return drawOffered ? "lost" : "void";
    }

    const homeWon = home > away;
    return (isHome && homeWon) || (isAway && !homeWon) ? "won" : "lost";
  }

  if (marketType === "totals") {
    const line = Number.isFinite(selection.line)
      ? selection.line
      : parseLineFromKey(selection.key);

    if (!Number.isFinite(line)) {
      return "void";
    }

    const total = home + away;

    if (total === line) {
      return "void"; // whole-number push
    }

    const key = String(selection.key);
    const isOver = key.startsWith("over");
    const isUnder = key.startsWith("under");

    if (!isOver && !isUnder) {
      return "void";
    }

    return (isOver && total > line) || (isUnder && total < line)
      ? "won"
      : "lost";
  }

  if (marketType === "spreads") {
    const line = Number.isFinite(selection.line)
      ? selection.line
      : parseLineFromKey(selection.key);

    if (!Number.isFinite(line)) {
      return "void";
    }

    const key = stripLineSuffix(selection.key);
    const isHome = homeKey !== null && key === homeKey;
    const isAway = awayKey !== null && key === awayKey;

    if (!isHome && !isAway) {
      return "void";
    }

    const own = isHome ? home : away;
    const opponent = isHome ? away : home;
    const adjusted = own + line;

    if (adjusted === opponent) {
      return "void"; // exact push
    }

    return adjusted > opponent ? "won" : "lost";
  }

  return "void";
};

// Settle one bet. Idempotent: the settlementStatus claim admits exactly one
// caller; every other invocation returns { skipped: true }. Shared by the
// admin endpoint and the automated scores pipeline.
export const settleSingleBet = async ({ bet, result, actor, event = null }) => {
  if (!["won", "lost", "void"].includes(result)) {
    throw new Error(`Invalid settlement result: ${result}`);
  }

  const walletAccount = await WalletAccount.findById(bet.walletAccountId);
  if (!walletAccount) {
    return { skipped: true, reason: "wallet-not-found" };
  }

  const claimed = await SportsBet.findOneAndUpdate(
    { _id: bet._id, settlementStatus: "unsettled" },
    {
      $set: {
        status: result,
        settlementStatus: result === "void" ? "voided" : "settled",
      },
    },
    { new: true }
  );

  if (!claimed) {
    return { skipped: true, reason: "already-settled" };
  }

  let creditAmount = 0;
  let ledgerCategory = null;
  let description = "";

  if (result === "won") {
    creditAmount = claimed.potentialPayout;
    ledgerCategory = "sports_settlement";
    description = `Sports bet won on ${claimed.selectionName}`;
  }

  if (result === "void") {
    creditAmount = claimed.stake;
    ledgerCategory = "sports_refund";
    description = `Sports bet voided for ${claimed.selectionName}`;
  }

  let ledgerEntry = null;
  let settledAccount = walletAccount;

  if (creditAmount > 0) {
    creditAmount = roundMoney(creditAmount);

    settledAccount = await WalletAccount.findOneAndUpdate(
      { _id: walletAccount._id },
      { $inc: { availableBalance: creditAmount } },
      { new: true }
    );

    if (settledAccount.walletType === "cash") {
      await syncLegacyBalance(claimed.userId, settledAccount.availableBalance);
    }

    ledgerEntry = await createLedgerEntry({
      userId: claimed.userId,
      walletAccountId: settledAccount._id,
      direction: "credit",
      category: ledgerCategory,
      amount: creditAmount,
      balanceAfter: settledAccount.availableBalance,
      description,
      referenceType: "SportsBet",
      referenceId: claimed._id,
      metadata: {
        result,
        settledBy: actor?.type || "system",
        settledByUserId: actor?.userId || null,
      },
    });
  }

  claimed.metadata = {
    ...claimed.metadata,
    settledAt: new Date().toISOString(),
    settledBy: actor?.type || "system",
    settledByUserId: actor?.userId || null,
    settlementLedgerEntryId: ledgerEntry?._id || null,
  };
  await claimed.save();

  await recordSettlementAudit({
    actor,
    action: "sports.bet.settled",
    betId: claimed._id,
    metadata: {
      result,
      walletAccountId: settledAccount._id,
      creditAmount,
      ledgerEntryId: ledgerEntry?._id || null,
    },
  });

  emitBetSettled({
    userId: claimed.userId,
    betId: claimed._id,
    result,
    payout: creditAmount,
    balanceAfter: settledAccount.availableBalance,
    selectionName: claimed.selectionName,
    eventName: event
      ? (event.competitors || []).map((entry) => entry.name).join(" vs ")
      : null,
  });

  return { bet: claimed, account: settledAccount, ledgerEntry };
};

const settleEventBets = async ({ event, markets, resolveResult, actor }) => {
  const marketById = new Map(
    markets.map((market) => [String(market._id), market])
  );

  const pendingBets = await SportsBet.find({
    eventId: event._id,
    settlementStatus: "unsettled",
  });

  const summary = { settledBets: 0, won: 0, lost: 0, void: 0, skipped: 0 };

  for (const bet of pendingBets) {
    const market = marketById.get(String(bet.marketId)) || null;
    const marketSelection = market?.selections?.find(
      (entry) => entry.key === bet.selectionKey
    );

    const selection = {
      key: bet.selectionKey,
      name: bet.selectionName,
      line: marketSelection?.line ?? bet.selectionLine ?? null,
    };

    const result = resolveResult({ market, selection });
    const outcome = await settleSingleBet({ bet, result, actor, event });

    if (outcome.skipped) {
      summary.skipped += 1;
    } else {
      summary.settledBets += 1;
      summary[result] += 1;
    }
  }

  return summary;
};

const suspendEventMarkets = async (event) => {
  const markets = await Market.find({ eventId: event._id });

  for (const market of markets) {
    if (market.status !== "settled") {
      market.status = "settled";
      market.selections = market.selections.map((selection) => ({
        ...(typeof selection.toObject === "function"
          ? selection.toObject()
          : selection),
        status: "settled",
      }));
      await market.save();

      emitMarketSuspended({
        eventId: event._id,
        sportGroup: event.sportGroup,
        marketId: market._id,
        status: "settled",
      });
    }
  }

  return markets;
};

// Idempotent event settlement orchestrator: the only code allowed to move an
// event into a terminal status. Safe to re-run after a crash — the per-bet
// settlementStatus claim skips everything already processed.
export const settleEvent = async (
  eventId,
  { actor = { type: "system" }, finalScoreboard = null, force = false } = {}
) => {
  const event = await SportsEvent.findById(eventId);

  if (!event) {
    return { skipped: true, reason: "event-not-found" };
  }

  if (["settled", "cancelled"].includes(event.status)) {
    return { skipped: true, reason: "already-settled" };
  }

  if (finalScoreboard) {
    event.scoreboard = { ...finalScoreboard, completed: true };
    event.markModified("scoreboard");
    await event.save();
  }

  if (!event.scoreboard?.completed && !force) {
    return { skipped: true, reason: "scoreboard-not-final" };
  }

  const previousStatus = event.status;
  const markets = await suspendEventMarkets(event);

  const summary = await settleEventBets({
    event,
    markets,
    actor,
    resolveResult: ({ market, selection }) =>
      determineSelectionResult({ market, selection, event }),
  });

  event.status = "settled";
  event.metadata = {
    ...event.metadata,
    settledAt: new Date().toISOString(),
    settledBy: actor?.type || "system",
  };
  await event.save();

  emitEventState({
    eventId: event._id,
    sportGroup: event.sportGroup,
    status: "settled",
    previousStatus,
    startTime: event.startTime,
  });

  return { eventId: event._id, ...summary };
};

// Cancel an event and refund every pending bet.
export const voidEvent = async (eventId, reason = "event-cancelled") => {
  const event = await SportsEvent.findById(eventId);

  if (!event) {
    return { skipped: true, reason: "event-not-found" };
  }

  if (["settled", "cancelled"].includes(event.status)) {
    return { skipped: true, reason: "already-settled" };
  }

  const previousStatus = event.status;
  const markets = await suspendEventMarkets(event);

  const summary = await settleEventBets({
    event,
    markets,
    actor: { type: "system" },
    resolveResult: () => "void",
  });

  event.status = "cancelled";
  event.metadata = {
    ...event.metadata,
    voidedAt: new Date().toISOString(),
    voidReason: reason,
  };
  await event.save();

  emitEventState({
    eventId: event._id,
    sportGroup: event.sportGroup,
    status: "cancelled",
    previousStatus,
    startTime: event.startTime,
  });

  return { eventId: event._id, reason, ...summary };
};
