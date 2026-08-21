/** Standard baccarat third-card tableau. Naturals (two-card 8 or 9) end the round. */

export const baccaratPoint = (card) => {
  if (!card?.value) return 0;
  if (["J", "Q", "K", "10"].includes(card.value)) return 0;
  if (card.value === "A") return 1;
  return parseInt(card.value, 10) || 0;
};

export const baccaratScore = (cards = []) =>
  cards.reduce((sum, card) => sum + baccaratPoint(card), 0) % 10;

export const isNatural = (twoCardScore) => twoCardScore >= 8;

export const shouldPlayerDrawThird = (twoCardScore) => twoCardScore <= 5;

export const shouldBankerDrawThird = ({
  bankerTwoCardScore,
  playerDrew,
  playerThirdPoint,
}) => {
  if (isNatural(bankerTwoCardScore)) return false;
  if (!playerDrew) return bankerTwoCardScore <= 5;
  if (bankerTwoCardScore <= 2) return true;
  if (bankerTwoCardScore === 3) return playerThirdPoint !== 8;
  if (bankerTwoCardScore === 4) {
    return playerThirdPoint >= 2 && playerThirdPoint <= 7;
  }
  if (bankerTwoCardScore === 5) {
    return playerThirdPoint >= 4 && playerThirdPoint <= 7;
  }
  if (bankerTwoCardScore === 6) {
    return playerThirdPoint === 6 || playerThirdPoint === 7;
  }
  return false;
};

export const applyBaccaratThirdCards = (playerCards, bankerCards, takeCard) => {
  const player = [...playerCards];
  const banker = [...bankerCards];
  const playerTwo = baccaratScore(player);
  const bankerTwo = baccaratScore(banker);

  if (isNatural(playerTwo) || isNatural(bankerTwo)) {
    return { playerCards: player, bankerCards: banker };
  }

  if (shouldPlayerDrawThird(playerTwo)) {
    player.push(takeCard());
  }

  const playerDrew = player.length > 2;
  const playerThirdPoint = playerDrew ? baccaratPoint(player[2]) : null;
  if (
    shouldBankerDrawThird({
      bankerTwoCardScore: bankerTwo,
      playerDrew,
      playerThirdPoint,
    })
  ) {
    banker.push(takeCard());
  }

  return { playerCards: player, bankerCards: banker };
};
