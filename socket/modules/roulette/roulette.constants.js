/** European roulette wheel pocket order (clockwise). */
export const ROULETTE_WHEEL_ORDER = [
  32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26, 0,
];

/** Map wheel slot index (0-36) to displayed pocket number. */
export const pocketFromWheelIndex = (index) =>
  ROULETTE_WHEEL_ORDER[index] ?? 0;

/** Map pocket number to wheel slot index. */
export const wheelIndexFromPocket = (pocket) => {
  const idx = ROULETTE_WHEEL_ORDER.indexOf(Number(pocket));
  return idx >= 0 ? idx : 0;
};
