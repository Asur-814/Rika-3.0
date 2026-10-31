import test from "node:test";
import assert from "node:assert/strict";
import { validateCredentials, VALID_LOGIN_ID, VALID_PASSWORD } from "./auth";

test("accepts valid Admin and admin24 credentials", () => {
  const res = validateCredentials("Admin", "admin24");
  assert.equal(res.valid, true);
  assert.equal(res.error, undefined);
  assert.deepEqual(res.user, {
    uid: "admin",
    loginId: VALID_LOGIN_ID,
    displayName: "Admin",
  });
});

test("trims surrounding whitespace on Login ID", () => {
  const res = validateCredentials("  Admin  ", VALID_PASSWORD);
  assert.equal(res.valid, true);
  assert.equal(res.user?.loginId, "Admin");
});

test("rejects wrong case on Login ID or password", () => {
  assert.equal(validateCredentials("admin", "admin24").valid, false);
  assert.equal(validateCredentials("Admin", "Admin24").valid, false);
});

test("rejects empty Login ID or empty password with specific messages", () => {
  const emptyId = validateCredentials("   ", "admin24");
  assert.equal(emptyId.valid, false);
  assert.equal(emptyId.error, "Please enter your Login ID.");

  const emptyPass = validateCredentials("Admin", "");
  assert.equal(emptyPass.valid, false);
  assert.equal(emptyPass.error, "Please enter your password.");
});

test("rejects incorrect credentials with clear error message", () => {
  const wrong = validateCredentials("User", "wrongpass");
  assert.equal(wrong.valid, false);
  assert.equal(wrong.error, "Invalid Login ID or password. Please try again.");
});
