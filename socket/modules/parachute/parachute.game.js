class ParachuteGame {
  constructor() {
    this.activeGames = new Map();
    this.crashProbabilities = {
      low: 0.005,
      medium: 0.01,
      high: 0.02,
    };
    this.tickInterval = 100;
    this.maxMultiplier = 100;
  }

  startGame(userId, betAmount, difficulty = "medium", walletType = "demo") {
    if (this.activeGames.has(userId)) {
      return { error: "Game already in progress" };
    }

    const gameState = {
      userId,
      betAmount: parseFloat(betAmount),
      difficulty,
      walletType,
      multiplier: 1.0,
      startTime: Date.now(),
      isCrashed: false,
      hasCheckedOut: false,
      intervalId: null,
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
      const newMultiplier = Math.exp(
        timeElapsed / this.getDifficultyMultiplier(gameState.difficulty)
      );

      if (newMultiplier >= this.maxMultiplier) {
        this.crashGame(userId);
        return;
      }

      gameState.multiplier = newMultiplier;

      const crashProb = this.crashProbabilities[gameState.difficulty];
      if (Math.random() < crashProb) {
        this.crashGame(userId);
      }
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
    if (!gameState) return;

    gameState.isCrashed = true;
    gameState.multiplier = Math.floor(gameState.multiplier * 100) / 100;
    this.stopGame(userId);
  }

  checkout(userId) {
    const gameState = this.activeGames.get(userId);
    if (!gameState || gameState.isCrashed || gameState.hasCheckedOut) {
      return { error: "Invalid checkout attempt" };
    }

    gameState.hasCheckedOut = true;
    gameState.multiplier = Math.floor(gameState.multiplier * 100) / 100;
    this.stopGame(userId);

    return {
      success: true,
      multiplier: gameState.multiplier,
      winAmount: gameState.betAmount * gameState.multiplier,
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
