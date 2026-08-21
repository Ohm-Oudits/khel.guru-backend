import { getLadder, normalizeRisk } from "./pump.ladders.js";

const userKey = (userId) => String(userId);

class PumpGame {
  constructor() {
    this.activeGames = new Map();
  }

  startRound(userId, { betAmount, walletType, risk, popAt, fairness = null }) {
    const key = userKey(userId);
    if (this.activeGames.has(key)) {
      return { error: "Game already in progress" };
    }

    const ladder = getLadder(risk);
    const popPoint = Number(popAt);
    if (!Number.isFinite(popPoint) || popPoint < 1) {
      return { error: "Invalid pop point" };
    }

    const gameState = {
      userId: key,
      betAmount: parseFloat(betAmount),
      walletType,
      risk: normalizeRisk(risk),
      ladder,
      popAt: popPoint,
      currentIndex: 0,
      currentMultiplier: ladder[0],
      isPopped: false,
      hasCheckedOut: false,
      fairness,
    };

    this.activeGames.set(key, gameState);
    return { success: true, gameState: this.snapshot(gameState) };
  }

  snapshot(gameState) {
    return {
      risk: gameState.risk,
      ladder: gameState.ladder,
      multiplier: gameState.currentMultiplier,
      currentIndex: gameState.currentIndex,
      isPopped: gameState.isPopped,
      hasCheckedOut: gameState.hasCheckedOut,
    };
  }

  pump(userId) {
    const gameState = this.activeGames.get(userKey(userId));
    if (!gameState || gameState.isPopped || gameState.hasCheckedOut) {
      return { error: "No active round to pump" };
    }

    const nextIndex = gameState.currentIndex + 1;
    if (nextIndex >= gameState.ladder.length) {
      return { error: "Maximum pump reached" };
    }

    const nextMultiplier = gameState.ladder[nextIndex];
    gameState.currentIndex = nextIndex;
    gameState.currentMultiplier = nextMultiplier;

    if (nextMultiplier >= gameState.popAt) {
      gameState.isPopped = true;
      return {
        success: true,
        popped: true,
        multiplier: nextMultiplier,
        popAt: gameState.popAt,
        gameState: this.snapshot(gameState),
      };
    }

    return {
      success: true,
      popped: false,
      multiplier: nextMultiplier,
      gameState: this.snapshot(gameState),
    };
  }

  checkout(userId) {
    const gameState = this.activeGames.get(userKey(userId));
    if (!gameState || gameState.isPopped || gameState.hasCheckedOut) {
      return { error: "Invalid checkout attempt" };
    }

    if (gameState.currentIndex <= 0) {
      return { error: "Pump at least once before checkout" };
    }

    const cashoutMultiplier =
      Math.floor(Number(gameState.currentMultiplier) * 100) / 100;
    const popAt = Math.floor(Number(gameState.popAt) * 100) / 100;

    gameState.hasCheckedOut = true;
    this.activeGames.delete(userKey(userId));

    return {
      success: true,
      multiplier: cashoutMultiplier,
      popAt,
      winAmount: gameState.betAmount * cashoutMultiplier,
      walletType: gameState.walletType,
      fairness: gameState.fairness,
    };
  }

  forfeit(userId) {
    const key = userKey(userId);
    const gameState = this.activeGames.get(key);
    if (!gameState) return null;

    const popAt = Math.floor(Number(gameState.popAt) * 100) / 100;
    const multiplier =
      Math.floor(Number(gameState.currentMultiplier) * 100) / 100;
    const walletType = gameState.walletType;
    const fairness = gameState.fairness;
    this.activeGames.delete(key);
    return { popAt, multiplier, walletType, fairness };
  }

  peekRound(userId) {
    const gameState = this.activeGames.get(userKey(userId));
    if (!gameState) return null;
    return {
      popAt: gameState.popAt,
      currentMultiplier: gameState.currentMultiplier,
      walletType: gameState.walletType,
      fairness: gameState.fairness,
    };
  }

  getGameState(userId) {
    const gameState = this.activeGames.get(userKey(userId));
    if (!gameState) return null;
    return this.snapshot(gameState);
  }

  clearRound(userId) {
    this.activeGames.delete(userKey(userId));
  }
}

const pumpGame = new PumpGame();
export default pumpGame;
