// Manual end-to-end sportsbook demo against a RUNNING dev server:
//   1. login the seeded dev user  2. ingest the simulated feed
//   3. place a bet on a live event  4. keep ticking until auto-settlement
//   5. print the bet outcome and the wallet ledger tail
//
// Fast run: SPORTSBOOK_SIM_MATCH_MINUTES=1 npm run dev:local
// then:     node scripts/e2e-sportsbook-demo.js

const BASE_URL = process.env.KG_E2E_BASE_URL || "http://localhost:8080/api";
const USERNAME = process.env.KG_DEV_USER_EMAIL || "test@khel.guru";
const PASSWORD = process.env.KG_DEV_USER_PASSWORD || "Test@123456";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const api = async (path, { method = "GET", token = null, body = null } = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(json)}`);
  }

  return json;
};

const main = async () => {
  console.log("1. login");
  const auth = await api("/auth/login", {
    method: "POST",
    body: { email: USERNAME, password: PASSWORD },
  });
  const token = auth.token;
  console.log(`   logged in as ${auth.user.username} (${auth.user.accountUid})`);

  // Manual ingest needs admin/support; when the scheduler's simTick is
  // running it does the ingesting anyway, so a 403 here is not fatal.
  let ingestForbidden = false;
  const tryIngest = async () => {
    if (ingestForbidden) return;
    try {
      await api("/sports/ingest", { method: "POST", token, body: { provider: "simulated" } });
    } catch (error) {
      if (!String(error.message).includes("403")) throw error;
      ingestForbidden = true;
      console.log("   manual ingest is admin-only for this user; relying on the scheduler simTick");
    }
  };

  console.log("2. ingest simulated feed");
  await tryIngest();

  console.log("3. find a live event with open markets");
  let event = null;
  for (let attempt = 0; attempt < 10 && !event; attempt += 1) {
    const { events } = await api("/sports/events?status=live&hydrate=1", { token });
    event = events.find((entry) =>
      entry.markets?.some(
        (market) =>
          market.status === "open" &&
          market.selections?.some((selection) => selection.priceDecimal)
      )
    );
    if (!event) {
      await tryIngest();
      await sleep(3000);
    }
  }

  if (!event) {
    throw new Error("No live simulated event became available");
  }

  const market = event.markets.find((entry) => entry.status === "open");
  const selection = market.selections.find((entry) => entry.priceDecimal);
  console.log(
    `   betting on ${selection.name} @ ${selection.priceDecimal} (${event.sportName}: ${event.competitors
      .map((c) => c.name)
      .join(" vs ")})`
  );

  console.log("4. top up demo wallet and place the bet");
  await api("/wallet/demo/top-up", { method: "POST", token, body: { amount: 1000 } });

  const placed = await api("/bets/single", {
    method: "POST",
    token,
    body: {
      eventId: event._id,
      marketId: market._id,
      selectionKey: selection.key,
      stake: 100,
      walletType: "demo",
      expectedPrice: selection.priceDecimal,
      acceptBetterOdds: true,
    },
  });
  const betId = placed.bet._id;
  console.log(`   bet ${betId} placed, balance ${placed.account.availableBalance}`);

  console.log("5. tick the simulation until the bet settles");
  const deadline = Date.now() + 15 * 60 * 1000;
  let bet = placed.bet;

  while (bet.settlementStatus === "unsettled" && Date.now() < deadline) {
    await tryIngest();
    await sleep(5000);
    bet = (await api(`/bets/${betId}`, { token })).bet;
    process.stdout.write(`   status=${bet.status}\r`);
  }

  console.log(`\n   final: status=${bet.status} settlement=${bet.settlementStatus}`);

  if (bet.settlementStatus === "unsettled") {
    throw new Error("Bet did not settle within the deadline — is the scheduler enabled?");
  }

  console.log("6. ledger tail");
  const { ledgerEntries } = await api("/wallet/ledger?limit=5", { token });
  for (const entry of ledgerEntries || []) {
    console.log(
      `   ${entry.direction} ${entry.category} ${entry.amount} -> balanceAfter ${entry.balanceAfter}`
    );
  }

  console.log("E2E sportsbook demo completed successfully");
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
