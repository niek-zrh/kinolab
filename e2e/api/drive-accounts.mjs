/**
 * Google accounts: a person's default (first connected) and the account a
 * production's hub is created in. No Google here, so these are the shape and
 * refusal checks; the selection rules themselves are unit-tested in
 * e2e/unit/drive-accounts.test.mjs.
 */
import {
  createSuite,
  newOwner,
  newProduction,
  addMember,
  mutation,
  query,
  action,
  must,
} from "./_harness.mjs";

export async function run() {
  const suite = createSuite("Drive accounts — defaults and per-production choice");
  const owner = await newOwner("accounts");
  const viewer = await addMember(owner.studioId, owner.token, "viewer");
  const other = await newOwner("accounts-foreign");
  const { productionId } = await newProduction(owner.studioId, owner.token, {
    name: "Accounts",
    code: "ACC",
  });

  const status = must(
    await query("drive:connectionStatus", { productionId }, owner.token),
    "status",
  );
  suite.check(
    "a fresh user has no accounts, no default and no hub",
    Array.isArray(status.myConnections) &&
      status.myConnections.length === 0 &&
      status.myConnection === null &&
      status.hub.connected === false,
    JSON.stringify(status).slice(0, 120),
  );
  suite.denied(
    "another studio cannot read a production's hub status",
    await query("drive:connectionStatus", { productionId }, other.token),
  );
  suite.denied(
    "an anonymous caller cannot read hub status",
    await query("drive:connectionStatus", { productionId }),
  );

  suite.denied(
    "flagging a default needs a real connection id",
    await mutation("drive:setDefaultConnection", { connectionId: "not-an-id" }, owner.token),
  );
  suite.denied(
    "an anonymous caller cannot flag a default",
    await mutation("drive:setDefaultConnection", { connectionId: "not-an-id" }),
  );

  const noAccount = await action("drive:scaffoldHub", { productionId }, owner.token);
  suite.check(
    "creating a hub without a connected account says to connect one",
    !noAccount.ok && /Connect your Google Drive/.test(noAccount.error),
    noAccount.ok ? "ALLOWED" : noAccount.error.slice(0, 80),
  );
  suite.denied(
    "a hub cannot be created with a connection id that is not mine",
    await action(
      "drive:scaffoldHub",
      { productionId, connectionId: "not-an-id" },
      owner.token,
    ),
  );
  suite.denied(
    "a viewer cannot create a hub",
    await action("drive:scaffoldHub", { productionId }, viewer.token),
  );
  suite.denied(
    "another studio cannot create a hub here",
    await action("drive:scaffoldHub", { productionId }, other.token),
  );
  suite.denied(
    "replacing a hub that does not exist is still refused without an account",
    await action("drive:scaffoldHub", { productionId, replace: true }, owner.token),
  );

  suite.denied(
    "the picker needs a connected account",
    await action("drive:getPickerConfig", {}, owner.token),
  );
  suite.denied(
    "the picker cannot borrow a connection id that is not mine",
    await action("drive:getPickerConfig", { connectionId: "not-an-id" }, owner.token),
  );
  suite.denied(
    "the picker for another studio's production is refused",
    await action("drive:getPickerConfig", { productionId }, other.token),
  );
  suite.denied(
    "an anonymous caller gets no picker",
    await action("drive:getPickerConfig", { productionId }),
  );
  return suite;
}
