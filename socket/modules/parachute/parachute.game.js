class ParachuteGame {
  constructor() {
    this.activeGames = new Map();
    this.tickInterval = 100;
  }

  startGame(
    userId,
    betAmount,
    difficulty = "medium",
    walletType = "demo",
    crashPoint = 1,
    onCrash = null
  ) {
    if (this.activeGames.has(userId)) {
      return { error: "Game already in progress" };
    }

    const gameState = {
      userId,
      betAmount: parseFloat(betAmount),
      difficulty,
      walletType,
      crashPoint: Number(crashPoint),
      multiplier: 1.0,
      startTime: Date.now(),
      isCrashed: false,
      hasCheckedOut: false,
      intervalId: null,
      onCrash,
    };

    this.activeGames.set(userId, gameState);
    this.startGameLoop(userId);

    return { success: true, gameState };
  }

  startGameLoop(userId) {
    const gameState = this.activeGames.get(userId);
    if (!gameState) return;

    gameState.intervalId = setInterval(() => {
      if (gameState.isCrashed || gameState.hasCheckedOut) {
        this.stopGame(userId);
        return;
      }

      const timeElapsed = (Date.now() - gameState.startTime) / 1000;
      const live = Math.exp(
        timeElapsed / this.getDifficultyMultiplier(gameState.difficulty)
      );

      if (live >= gameState.crashPoint) {
        this.crashGame(userId);
        return;
      }

      gameState.multiplier = Math.floor(live * 100) / 100;
    }, this.tickInterval);
  }

  getDifficultyMultiplier(difficulty) {
    switch (difficulty) {
      case "low":
        return 24;
      case "medium":
        return 18;
      case "high":
        return 12;
      default:
        return 18;
    }
  }

  crashGame(userId) {
    const gameState = this.activeGames.get(userId);
    if (!gameState || gameState.isCrashed) return;

    gameState.isCrashed = true;
    gameState.multiplier = Math.floor(gameState.crashPoint * 100) / 100;
    const onCrash = gameState.onCrash;
    const finalMultiplier = gameState.multiplier;
    this.stopGame(userId);
    if (onCrash) {
      onCrash({ multiplier: finalMultiplier, isCrashed: true });
    }
  }

  forfeitGame(userId) {
    const gameState = this.activeGames.get(userId);
    if (!gameState || gameState.hasCheckedOut) return null;

    if (!gameState.isCrashed) {
      gameState.isCrashed = true;
      gameState.multiplier = Math.floor(gameState.multiplier * 100) / 100;
    }

    const onCrash = gameState.onCrash;
    const finalMultiplier = gameState.multiplier;
    this.stopGame(userId);
    if (onCrash) {
      onCrash({ multiplier: finalMultiplier, isCrashed: true });
    }

    return { multiplier: finalMultiplier, isCrashed: true };
  }

  checkout(userId) {
    const gameState = this.activeGames.get(userId);
    if (!gameState || gameState.isCrashed || gameState.hasCheckedOut) {
      return { error: "Invalid checkout attempt" };
    }

    const crashPoint = Math.floor(gameState.crashPoint * 100) / 100;
    const cashoutMultiplier = Math.floor(gameState.multiplier * 100) / 100;

    gameState.hasCheckedOut = true;
    gameState.multiplier = cashoutMultiplier;
    this.stopGame(userId);

    return {
      success: true,
      multiplier: cashoutMultiplier,
      crashPoint,
      winAmount: gameState.betAmount * cashoutMultiplier,
    };
  }

  stopGame(userId) {
    const gameState = this.activeGames.get(userId);
    if (!gameState) return;

    if (gameState.intervalId) {
      clearInterval(gameState.intervalId);
    }

    const finalState = {
      userId,
      multiplier: gameState.multiplier,
      isCrashed: gameState.isCrashed,
      hasCheckedOut: gameState.hasCheckedOut,
      winAmount: gameState.hasCheckedOut
        ? gameState.betAmount * gameState.multiplier
        : 0,
    };

    this.activeGames.delete(userId);
    return finalState;
  }

  getGameState(userId) {
    return this.activeGames.get(userId);
  }
}

const parachuteGame = new ParachuteGame();
export default parachuteGame;
