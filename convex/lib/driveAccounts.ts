/**
 * Which of a person's connected Google accounts to use when.
 *
 * A user may connect several Google accounts (one googleConnections row per
 * account). Their *default* is the first one they ever connected, unless they
 * flagged another; a production's hub can be created with any of their
 * accounts instead (production.hub.connectionId), which is how one studio
 * member keeps a client's project in the client's Drive.
 */
export type ConnectionLike = {
  _id: string;
  _creationTime: number;
  revoked?: boolean;
  isDefault?: boolean;
};

/**
 * The flagged default, else the first account ever connected — preferring
 * one whose token still works, so a revoked first account does not shadow
 * a working second one.
 */
export function defaultConnection<T extends ConnectionLike>(rows: T[]): T | null {
  const flagged = rows.find((r) => r.isDefault === true);
  if (flagged !== undefined) return flagged;
  const byAge = [...rows].sort((a, b) => a._creationTime - b._creationTime);
  return byAge.find((r) => r.revoked !== true) ?? byAge[0] ?? null;
}

/**
 * The account to read Drive with for one production (the Picker, Attach from
 * Drive): the hub's own account when it is one of mine and still works —
 * that is the Drive the production's files live in — else my default.
 */
export function readerConnection<T extends ConnectionLike>(
  rows: T[],
  hubConnectionId: string | null,
): T | null {
  if (hubConnectionId !== null) {
    const own = rows.find((r) => r._id === hubConnectionId);
    if (own !== undefined && own.revoked !== true) return own;
  }
  return defaultConnection(rows);
}
