import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSISTANTS, assistantForPath } from "../../lib/assistant-roadmap.ts";

test("assistant roadmap has unique ids, safe destinations, and explicit review contracts", () => {
  assert.equal(ASSISTANTS.length, 6);
  assert.equal(new Set(ASSISTANTS.map((a) => a.id)).size, 6);
  for (const assistant of ASSISTANTS) {
    assert.match(assistant.path, /^[a-z-]+$/);
    for (const field of ["inputs", "output", "approval", "detail"])
      assert.ok(assistant[field].length > 20);
    assert.ok(!("provider" in assistant));
    assert.ok(!("execute" in assistant));
  }
});
test("assistant slots follow production sections and nested detail routes", () => {
  for (const [path, expected] of [
    ["", "production"],
    ["/my-work", "production"],
    ["/board", "production"],
    ["/reports", "production"],
    ["/storyboard", "story"],
    ["/shots/shot123", "story"],
    ["/references", "look"],
    ["/characters/character123", "character"],
    ["/review/shot123", "review"],
    ["/decisions", "review"],
    ["/qc/run123", "delivery"],
    ["/files", "delivery"],
  ])
    assert.equal(assistantForPath(`/p/production123${path}`)?.id, expected);
});
test("assistant slots do not leak into account, settings, or unrelated routes", () => {
  for (const path of [
    "/",
    "/new",
    "/team",
    "/sign-in",
    "/p/",
    "/p/review/settings",
    "/p/x/assistants",
    "/p/x/review-other",
    "/other/p/x/review",
  ]) {
    assert.equal(assistantForPath(path), undefined);
  }
});
