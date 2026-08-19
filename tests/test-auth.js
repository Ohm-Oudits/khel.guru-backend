import assert from "node:assert/strict";

import userRouter from "../routes/user.route.js";

const routeEntries = userRouter.stack
  .filter((layer) => layer.route)
  .map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods)
      .filter((method) => layer.route.methods[method])
      .map((method) => method.toUpperCase())
      .sort(),
  }));

const expectRoute = (path, methods) => {
  const route = routeEntries.find((entry) => entry.path === path);

  assert(route, `Expected route ${path} to exist`);
  assert.deepEqual(
    route.methods,
    methods.sort(),
    `Expected ${path} to expose methods ${methods.join(", ")}`
  );
};

expectRoute("/register", ["POST"]);
expectRoute("/instant-register", ["POST"]);
expectRoute("/login", ["POST"]);
expectRoute("/google-auth", ["POST"]);
expectRoute("/telegram-auth", ["POST"]);
expectRoute("/x-auth", ["POST"]);
expectRoute("/forgot-password", ["POST"]);
expectRoute("/verify-otp", ["POST"]);
expectRoute("/reset-password", ["POST"]);
expectRoute("/send-phone-otp", ["POST"]);
expectRoute("/verify-phone-otp", ["POST"]);
expectRoute("/me", ["GET"]);
expectRoute("/logout", ["POST"]);

assert.equal(
  routeEntries.length,
  13,
  "User router should expose the expected auth surface"
);

console.log("Auth route smoke test passed");
