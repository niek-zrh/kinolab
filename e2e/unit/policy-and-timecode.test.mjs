import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocalDeployment,
  passwordSignupAllowed,
  signupsRequireInvite,
  canClaimEmailInvite,
} from "../../convex/lib/authPolicy.ts";
import { formatReviewTime } from "../../lib/timecode.ts";

test("only loopback deployments get local defaults", () => {
  for (const url of [
    "http://localhost:3211",
    "http://127.0.0.1:3213",
    "http://[::1]:3211",
  ]) {
    const env = { CONVEX_SITE_URL: url };
    assert.equal(isLocalDeployment(env), true);
    assert.equal(passwordSignupAllowed(env), true);
    assert.equal(signupsRequireInvite(env), false);
  }
  for (const url of [
    undefined,
    "",
    "bad-url",
    "https://studio.convex.site",
    "https://localhost.example.com",
  ]) {
    const env = { CONVEX_SITE_URL: url };
    assert.equal(isLocalDeployment(env), false);
    assert.equal(passwordSignupAllowed(env), false);
    assert.equal(signupsRequireInvite(env), true);
  }
});
test("invite-only always wins, and open registration does not enable unverified passwords", () => {
  assert.equal(
    signupsRequireInvite({ ALLOW_OPEN_SIGNUPS: "1", INVITE_ONLY_SIGNUPS: "1" }),
    true,
  );
  assert.equal(signupsRequireInvite({ ALLOW_OPEN_SIGNUPS: "1" }), false);
  assert.equal(passwordSignupAllowed({ ALLOW_OPEN_SIGNUPS: "1" }), false);
  assert.equal(passwordSignupAllowed({ ALLOW_PASSWORD_SIGNUPS: "1" }), true);
  assert.equal(
    passwordSignupAllowed({
      CONVEX_SITE_URL: "http://localhost:3211",
      ALLOW_PASSWORD_SIGNUPS: "0",
    }),
    false,
  );
});
test("elapsed review times preserve milliseconds and carry across minute and hour boundaries", () => {
  for (const [input, output] of [
    [0, "00:00.000"],
    [1.25, "00:01.250"],
    [59.9996, "01:00.000"],
    [3661.125, "01:01:01.125"],
    [-1, "00:00.000"],
    [NaN, "00:00.000"],
  ])
    assert.equal(formatReviewTime(input), output);
});

test("legacy unverified accounts cannot claim new remote invites", () => {
  assert.equal(canClaimEmailInvite({}, undefined), false);
  assert.equal(canClaimEmailInvite({}, Date.now()), true);
  assert.equal(
    canClaimEmailInvite({ CONVEX_SITE_URL: "http://localhost:3211" }),
    true,
  );
  assert.equal(canClaimEmailInvite({ ALLOW_PASSWORD_SIGNUPS: "1" }), true);
  assert.equal(canClaimEmailInvite({ ALLOW_PASSWORD_SIGNUPS: "0" }), false);
});
