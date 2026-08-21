import User from "../../../models/user.model.js";
import Game from "../../../models/game.model.js";
import Twist from "../../../models/games/twist.model.js";
import {
  debitGameStake,
  creditGameWin,
} from "../../../services/casinoWallet.service.js";
import { consumeGameFloats } from "../../../services/fairnessConsume.service.js";
import { deriveTwistOutcome } from "./twist.fairness.js";
import {
  applyTwistOutcome,
  boardMultiplier,
  buildTwistFairnessPayload,
  computeBoardPayout,
  reduceBoardProgress,
} from "./twist.payout.js";

const progressOf = (session) => ({
  green: session.green,
  orange: session.orange,
  purple: session.purple,
});

const serializeSession = (session, extra = {}) => ({
  status: session.status,
  betAmount: session.betAmount,
  walletType: session.walletType,
  progress: progressOf(session),
  boardMultiplier: boardMultiplier(progressOf(session)),
  lastOutcome: session.lastOutcome,
  fairness: session.nonce != null ? buildTwistFairnessPayload(session) : null,
  ...extra,
});

const getActiveSession = (userId) =>
  Twist.findOne({ userId, status: "active" }).sort({ updatedAt: -1 });

const service = {
  async join(userId) {
    try {
      const game = await Game.findOne({ name: "twist" });
      if (!game) {
        return { error: "Game not found" };
      }

      const user = await User.findById(userId);
      if (!user) {
        return { error: "User not found" };
      }

      const gameIndex = user.continuedGames.findIndex(
        (gameId) => gameId.toString() === game._id.toString()
      );

      if (gameIndex !== -1) {
        user.continuedGames.splice(gameIndex, 1);
      }
      user.continuedGames.unshift(game._id);
      game.gamesPlayed = game.gamesPlayed + 1;

      await user.save();
      await game.save();
      return { success: true };
    } catch (error) {
      return { error: "An error occurred while joining the game" };
    }
  },

  async getState(userId) {
    const session = await getActiveSession(userId);
    if (!session) {
      return {
        status: "idle",
        progress: { green: 0, orange: 0, purple: 0 },
        boardMultiplier: 0,
        fairness: null,
      };
    }
    return serializeSession(session);
  },

  async placeBet(userId, betAmount, walletType = "demo") {
    try {
      const stake = Number(betAmount);
      if (!userId || Number.isNaN(stake) || stake <= 0) {
        return { error: "Invalid bet amount" };
      }

      let session = await getActiveSession(userId);
      if (session && Math.abs(Number(session.betAmount) - stake) > 1e-8) {
        return { error: "Stake is locked for this Twist run" };
      }

      const debitWallet = session?.walletType || walletType || "demo";

      const debit = await debitGameStake(userId, {
        gameKey: "twist",
        amount: stake,
        walletType: debitWallet,
      });
      if (debit.error) {
        return { error: debit.error };
      }

      const fairness = await consumeGameFloats({
        userId,
        gameKey: "twist",
      });
      const float = fairness.floats[0];
      const outcome = deriveTwistOutcome(float);

      if (!session) {
        session = await Twist.create({
          userId,
          status: "active",
          betAmount: stake,
          walletType: debitWallet,
          green: 0,
          orange: 0,
          purple: 0,
        });
      }

      const next = applyTwistOutcome(progressOf(session), outcome);
      session.green = next.green;
      session.orange = next.orange;
      session.purple = next.purple;
      session.lastOutcome = outcome;
      session.lastFloat = float;
      session.nonce = fairness.nonce;
      session.clientSeed = fairness.clientSeed;
      session.serverSeedHash = fairness.serverSeedHash;
      await session.save();

      return {
        result: {
          outcome,
          float,
          progress: next,
          boardMultiplier: boardMultiplier(next),
          boardPayout: computeBoardPayout(session.betAmount, next),
          betAmount: session.betAmount,
          newBalance: debit.balance,
          walletType: debitWallet,
          nonce: fairness.nonce,
          clientSeed: fairness.clientSeed,
          serverSeedHash: fairness.serverSeedHash,
        },
      };
    } catch (error) {
      console.error("Error in twist placeBet:", error);
      return { error: "An error occurred while placing bet" };
    }
  },

  async cashout(userId) {
    try {
      const session = await getActiveSession(userId);
      if (!session) {
        return { error: "No active Twist run" };
      }

      const progress = progressOf(session);
      const payout = computeBoardPayout(session.betAmount, progress);
      if (payout <= 0) {
        return { error: "Nothing to cash out" };
      }

      const credit = await creditGameWin(userId, {
        gameKey: "twist",
        amount: payout,
        walletType: session.walletType,
      });

      session.status = "settled";
      session.lastPayout = payout;
      await session.save();

      return {
        result: {
          kind: "cashout",
          payout,
          multiplier: boardMultiplier(progress),
          progress: { green: 0, orange: 0, purple: 0 },
          newBalance: credit.balance,
          fairness: buildTwistFairnessPayload(session, {
            payout,
            kind: "cashout",
          }),
        },
      };
    } catch (error) {
      console.error("Error in twist cashout:", error);
      return { error: "An error occurred while cashing out" };
    }
  },

  async partialCashout(userId) {
    try {
      const session = await getActiveSession(userId);
      if (!session) {
        return { error: "No active Twist run" };
      }

      const current = progressOf(session);
      const remaining = reduceBoardProgress(current);
      const payout =
        computeBoardPayout(session.betAmount, current) -
        computeBoardPayout(session.betAmount, remaining);
      if (payout <= 0) {
        return { error: "Nothing to cash out" };
      }

      const credit = await creditGameWin(userId, {
        gameKey: "twist",
        amount: Number(payout.toFixed(6)),
        walletType: session.walletType,
      });

      session.green = remaining.green;
      session.orange = remaining.orange;
      session.purple = remaining.purple;
      session.lastPayout = Number(payout.toFixed(6));
      await session.save();

      return {
        result: {
          kind: "partial",
          payout: Number(payout.toFixed(6)),
          multiplier: Number(
            (
              boardMultiplier(current) - boardMultiplier(remaining)
            ).toFixed(4)
          ),
          progress: remaining,
          newBalance: credit.balance,
          fairness: buildTwistFairnessPayload(session, {
            payout: Number(payout.toFixed(6)),
            kind: "partial",
          }),
        },
      };
    } catch (error) {
      console.error("Error in twist partialCashout:", error);
      return { error: "An error occurred while cashing out" };
    }
  },
};

export default service;
