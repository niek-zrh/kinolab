type Environment = Record<string, string | undefined>;

/** Existing unverified accounts must not claim new remote invites either. */
export function canClaimEmailInvite(
  env: Environment,
  emailVerificationTime?: number,
): boolean {
  return Boolean(emailVerificationTime) || passwordSignupAllowed(env);
}

export function isLocalDeployment(env: Environment): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.CONVEX_SITE_URL ?? "").hostname,
    );
  } catch {
    return false;
  }
}

/** Password registration has no email verification; production must opt in. */
export function passwordSignupAllowed(env: Environment): boolean {
  if (env.ALLOW_PASSWORD_SIGNUPS === "0") return false;
  return isLocalDeployment(env) || env.ALLOW_PASSWORD_SIGNUPS === "1";
}

export function signupsRequireInvite(env: Environment): boolean {
  if (env.INVITE_ONLY_SIGNUPS === "1") return true;
  if (env.ALLOW_OPEN_SIGNUPS === "1") return false;
  return !isLocalDeployment(env);
}
