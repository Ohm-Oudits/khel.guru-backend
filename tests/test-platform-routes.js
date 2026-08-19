import assert from "node:assert/strict";

import accountRouter from "../routes/account.route.js";
import adminRouter from "../routes/admin.route.js";
import securityRouter from "../routes/security.route.js";
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
const securityRoutes = getRouteEntries(securityRouter);
const supportRoutes = getRouteEntries(supportRouter);
const walletRoutes = getRouteEntries(walletRouter);

expectRoute(accountRoutes, "/overview", ["GET"]);
expectRoute(adminRoutes, "/overview", ["GET"]);
expectRoute(adminRoutes, "/queues", ["GET"]);

expectRoute(securityRoutes, "/overview", ["GET"]);
expectRoute(securityRoutes, "/sessions", ["GET"]);
expectRoute(securityRoutes, "/sessions/:sessionId/revoke", ["POST"]);

expectRoute(supportRoutes, "/overview", ["GET"]);
expectRoute(supportRoutes, "/tickets", ["GET", "POST"]);

expectRoute(walletRoutes, "/balance", ["GET"]);
expectRoute(walletRoutes, "/accounts", ["GET"]);
expectRoute(walletRoutes, "/ledger", ["GET"]);
expectRoute(walletRoutes, "/deposit", ["POST"]);
expectRoute(walletRoutes, "/withdraw", ["POST"]);
expectRoute(walletRoutes, "/vault/transfer", ["POST"]);
expectRoute(walletRoutes, "/transactions", ["GET"]);

assert.equal(accountRoutes.length, 1, "Account router surface changed unexpectedly");
assert.equal(adminRoutes.length, 2, "Admin router surface changed unexpectedly");
assert.equal(securityRoutes.length, 3, "Security router surface changed unexpectedly");
assert.equal(supportRoutes.length, 2, "Support router surface changed unexpectedly");
assert.equal(walletRoutes.length, 7, "Wallet router surface changed unexpectedly");

console.log("Platform route smoke test passed");
