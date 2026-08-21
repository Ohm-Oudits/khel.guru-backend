/** Stake Originals Baccarat: fixed per-round odds, not a HiLo-style chain. */
export const BACCARAT_ODDS = {
  player: { profitOdds: 1, totalReturn: 2, label: "1:1" },
  banker: { profitOdds: 0.95, totalReturn: 1.95, label: "0.95:1" },
  tie: { profitOdds: 8, totalReturn: 9, label: "8:1" },
};

const money = (value) => Number(Number(value).toFixed(6));

export const settleBaccaratBet = (winner, betType, amount) => {
  const stake = Number(amount) || 0;
  if (betType === winner) {
    return {
      status: "won",
      payout: money(stake * BACCARAT_ODDS[betType].totalReturn),
    };
  }
  // Player / Banker bets push when the round ties — stake is returned.
  if (winner === "tie" && betType !== "tie") {
    return { status: "push", payout: money(stake) };
  }
  return { status: "lost", payout: 0 };
};

export default { BACCARAT_ODDS, settleBaccaratBet };
