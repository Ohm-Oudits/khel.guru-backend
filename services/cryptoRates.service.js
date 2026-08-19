const DEFAULT_MOCK_RATES = {
  eth: 300000,
  sol: 15000,
};

const getMockRate = (chain) => {
  const envKey = chain === "eth" ? "CRYPTO_MOCK_RATE_ETH_INR" : "CRYPTO_MOCK_RATE_SOL_INR";
  const configured = Number(process.env[envKey]);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MOCK_RATES[chain];
};

// Provider seam mirroring the sportsbook pattern: a real oracle slots in as a
// new provider string without touching the crediting flow.
export const getRateToInr = (chain) => {
  const provider = (process.env.CRYPTO_RATE_PROVIDER || "mock").trim();

  if (provider === "mock") {
    const rate = getMockRate(chain);
    if (!rate) {
      throw new Error(`No mock INR rate configured for chain: ${chain}`);
    }
    return rate;
  }

  throw new Error(`Unsupported crypto rate provider: ${provider}`);
};
