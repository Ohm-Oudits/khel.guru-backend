import assert from "node:assert/strict";

import accountRouter from "../routes/account.route.js";
import adminRouter from "../routes/admin.route.js";
import betsRouter from "../routes/bets.route.js";
import gameRouter from "../routes/game.route.js";
import securityRouter from "../routes/security.route.js";
import sportRouter from "../routes/sport.route.js";
import supportRouter from "../routes/support.route.js";
import walletRouter from "../routes/wallet.route.js";

const getRouteEntries = (router) =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
        .filter((method) => layer.route.methods[method])
        .map((method) => method.toUpperCase())
        .sort(),
    }))
    .reduce((entries, route) => {
      const existingRoute = entries.find((entry) => entry.path === route.path);

      if (!existingRoute) {
        entries.push(route);
        return entries;
      }

      existingRoute.methods = Array.from(
        new Set([...existingRoute.methods, ...route.methods])
      ).sort();

      return entries;
    }, []);

const expectRoute = (entries, path, methods) => {
  const route = entries.find((entry) => entry.path === path);

  assert(route, `Expected route ${path} to exist`);
  assert.deepEqual(
    route.methods,
    methods.sort(),
    `Expected ${path} to expose methods ${methods.join(", ")}`
  );
};

const accountRoutes = getRouteEntries(accountRouter);
const adminRoutes = getRouteEntries(adminRouter);
const betsRoutes = getRouteEntries(betsRouter);
const gameRoutes = getRouteEntries(gameRouter);
const securityRoutes = getRouteEntries(securityRouter);
const sportRoutes = getRouteEntries(sportRouter);
const supportRoutes = getRouteEntries(supportRouter);
const walletRoutes = getRouteEntries(walletRouter);

expectRoute(accountRoutes, "/overview", ["GET"]);
expectRoute(accountRoutes, "/kyc", ["GET", "PUT"]);
expectRoute(accountRoutes, "/responsible-gaming", ["GET"]);
expectRoute(accountRoutes, "/responsible-gaming/limits", ["PUT"]);
expectRoute(accountRoutes, "/self-exclusions", ["GET", "POST"]);
expectRoute(adminRoutes, "/overview", ["GET"]);
expectRoute(adminRoutes, "/queues", ["GET"]);
expectRoute(adminRoutes, "/kyc/queue", ["GET"]);
expectRoute(adminRoutes, "/kyc/:userId/review", ["POST"]);
expectRoute(adminRoutes, "/self-exclusions", ["GET"]);
expectRoute(adminRoutes, "/crypto/deposits", ["GET"]);
expectRoute(adminRoutes, "/crypto/deposits/:depositId/recheck", ["POST"]);

expectRoute(betsRoutes, "/single", ["POST"]);
expectRoute(betsRoutes, "/history", ["GET"]);
expectRoute(betsRoutes, "/:betId", ["GET"]);
expectRoute(betsRoutes, "/:betId/settle", ["POST"]);

expectRoute(gameRoutes, "/", ["GET", "POST"]);
expectRoute(gameRoutes, "/update/:id", ["PUT"]);
expectRoute(gameRoutes, "/:id", ["DELETE"]);
expectRoute(gameRoutes, "/all", ["GET"]);
expectRoute(gameRoutes, "/popular", ["GET"]);
expectRoute(gameRoutes, "/continue", ["GET"]);
expectRoute(gameRoutes, "/fairness/overview", ["GET"]);
expectRoute(gameRoutes, "/fairness/verify", ["POST"]);
expectRoute(gameRoutes, "/fairness/seeds", ["GET"]);
expectRoute(gameRoutes, "/fairness/current/:gameKey", ["GET"]);
expectRoute(gameRoutes, "/fairness/:gameKey/rotate", ["POST"]);

expectRoute(securityRoutes, "/overview", ["GET"]);
expectRoute(securityRoutes, "/sessions", ["GET"]);
expectRoute(securityRoutes, "/sessions/:sessionId/revoke", ["POST"]);

expectRoute(sportRoutes, "/catalog", ["GET"]);
expectRoute(sportRoutes, "/providers", ["GET"]);
expectRoute(sportRoutes, "/providers/:provider/sports", ["GET"]);
expectRoute(sportRoutes, "/events", ["GET"]);
expectRoute(sportRoutes, "/events/:eventId", ["GET"]);
expectRoute(sportRoutes, "/events/:eventId/markets", ["GET"]);
expectRoute(sportRoutes, "/ingest", ["POST"]);
expectRoute(sportRoutes, "/", ["GET", "POST"]);
expectRoute(sportRoutes, "/update/:id", ["PUT"]);
expectRoute(sportRoutes, "/:id", ["DELETE"]);
expectRoute(sportRoutes, "/all", ["GET"]);

expectRoute(supportRoutes, "/overview", ["GET"]);
expectRoute(supportRoutes, "/tickets", ["GET", "POST"]);

expectRoute(walletRoutes, "/balance", ["GET"]);
expectRoute(walletRoutes, "/accounts", ["GET"]);
expectRoute(walletRoutes, "/ledger", ["GET"]);
expectRoute(walletRoutes, "/deposit", ["POST"]);
expectRoute(walletRoutes, "/demo/top-up", ["POST"]);
expectRoute(walletRoutes, "/withdraw", ["POST"]);
expectRoute(walletRoutes, "/vault/transfer", ["POST"]);
expectRoute(walletRoutes, "/transactions", ["GET"]);
expectRoute(walletRoutes, "/crypto/addresses", ["GET"]);
expectRoute(walletRoutes, "/crypto/deposits", ["GET"]);
expectRoute(walletRoutes, "/crypto/deposits/simulate", ["POST"]);

assert.equal(accountRoutes.length, 5, "Account router surface changed unexpectedly");
assert.equal(adminRoutes.length, 7, "Admin router surface changed unexpectedly");
assert.equal(betsRoutes.length, 4, "Bets router surface changed unexpectedly");
assert.equal(gameRoutes.length, 11, "Game router surface changed unexpectedly");
assert.equal(securityRoutes.length, 3, "Security router surface changed unexpectedly");
assert.equal(sportRoutes.length, 11, "Sports router surface changed unexpectedly");
assert.equal(supportRoutes.length, 2, "Support router surface changed unexpectedly");
assert.equal(walletRoutes.length, 11, "Wallet router surface changed unexpectedly");

console.log("Platform route smoke test passed");
