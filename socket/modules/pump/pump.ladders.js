export const PUMP_LADDERS = {
  Low: [
    1.01, 1.23, 1.55, 1.98, 2.56, 3.36, 4.48, 6.08, 12.0, 35.0, 50.0, 73.0,
    144.0, 200.0,
  ],
  Medium: [1.01, 1.55, 2.56, 6.08, 12.0, 35.0, 50.0, 73.0, 200.0],
  High: [1.01, 2.56, 6.08, 35.0, 50.0, 73.0, 200.0],
};

export const normalizeRisk = (risk) => {
  const key = String(risk || "Low");
  if (key === "Medium" || key === "High") return key;
  return "Low";
};

export const getLadder = (risk) => PUMP_LADDERS[normalizeRisk(risk)];
