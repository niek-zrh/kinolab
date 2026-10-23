import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultConnection,
  readerConnection,
} from "../../convex/lib/driveAccounts.ts";

const first = { _id: "c1", _creationTime: 100 };
const second = { _id: "c2", _creationTime: 200 };
const third = { _id: "c3", _creationTime: 300 };

test("the default is the first account ever connected", () => {
  assert.equal(defaultConnection([second, first, third]), first);
  assert.equal(defaultConnection([]), null);
});

test("a flagged default wins over age", () => {
  const flagged = { ...second, isDefault: true };
  assert.equal(defaultConnection([first, flagged, third]), flagged);
});

test("a revoked first account does not shadow a working one", () => {
  const dead = { ...first, revoked: true };
  assert.equal(defaultConnection([dead, second]), second);
  // …unless nothing works, in which case the oldest is still reported.
  assert.equal(defaultConnection([dead, { ...second, revoked: true }]), dead);
});

test("Drive is read with the hub's account when it is mine", () => {
  assert.equal(readerConnection([first, second], "c2"), second);
  assert.equal(readerConnection([first, second], null), first);
  // Somebody else's hub, or my revoked one: fall back to my default.
  assert.equal(readerConnection([first, second], "other"), first);
  assert.equal(readerConnection([first, { ...second, revoked: true }], "c2"), first);
});
