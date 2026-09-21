import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { claimInvitesForUser } from "./studios";
import { passwordSignupAllowed, signupsRequireInvite } from "./lib/authPolicy";

/**
 * Sign-in identity only (openid email profile). The Drive connection is a
 * separate OAuth flow (convex/drive.ts + convex/http.ts) per spec §7.2.
 *
 * The Password provider is the dev/pilot fallback so the app is usable before
 * the studio's GCP OAuth client exists. Google activates automatically once
 * AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are set on the deployment.
 */
const password = Password({
  profile(params) {
    if (params.flow === "signUp" && !passwordSignupAllowed(process.env)) {
      throw new ConvexError(
        "Password registration is disabled here. Use your invited Google account or contact your producer.",
      );
    }
    if (typeof params.email !== "string")
      throw new ConvexError("Email is required");
    const email = params.email.toLowerCase().trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new ConvexError("Enter a valid email address");
    return {
      email,
      name:
        typeof params.name === "string"
          ? params.name.trim().slice(0, 120) || email.split("@")[0]
          : email.split("@")[0],
    };
  },
});

const google = Google({
  profile(profile) {
    if (profile.email_verified !== true || typeof profile.email !== "string") {
      throw new Error(
        "Google must verify your email before you can join a studio.",
      );
    }
    return {
      id: profile.sub,
      email: profile.email.toLowerCase().trim(),
      name: profile.name,
      image: profile.picture,
      emailVerified: true,
    };
  },
});

/**
 * Invite-only sign-up (policy lives in lib/authPolicy.ts).
 * New accounts are allowed only when:
 *  - the email has a pending studio invite (the normal onboarding path), or
 *  - the email is on ADMIN_SIGNUP_ALLOWLIST (comma-separated, for
 *    bootstrapping owners).
 * Existing users always sign in normally.
 */
async function signupAllowed(
  ctx: MutationCtx,
  email: string | undefined,
): Promise<boolean> {
  if (!signupsRequireInvite(process.env)) return true;
  if (!email) return false;
  const allowlist = (process.env.ADMIN_SIGNUP_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.includes(email)) return true;
  const invite = await ctx.db
    .query("memberships")
    .withIndex("by_invited_email", (q) => q.eq("invitedEmail", email))
    .first();
  if (invite !== null) return true;
  // Never let the first internet visitor bootstrap an unconfigured server.
  return false;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers:
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [password, google]
      : [password],
  callbacks: {
    // NOTE: overriding createOrUpdateUser replaces the library default, and
    // with it the call to afterUserCreatedOrUpdated — so invite claiming
    // (spec F1: membership rows carrying invitedEmail attach on sign-in)
    // happens directly here, on BOTH the sign-in and sign-up paths.
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId !== null) {
        // Older releases did not persist this marker even for Google users.
        // An already-linked Google identity can safely establish it now.
        if (
          args.type === "oauth" &&
          args.provider.id === "google" &&
          args.profile.emailVerified === true
        ) {
          await ctx.db.patch(args.existingUserId, {
            emailVerificationTime: Date.now(),
          });
        }
        await claimInvitesForUser(ctx, args.existingUserId);
        return args.existingUserId;
      }
      const profile = args.profile as {
        email?: string;
        name?: string;
        image?: string;
        emailVerified?: boolean;
      };
      const email = profile.email?.toLowerCase().trim();
      // Link only identities verified on BOTH sides. Linking an unverified
      // password account would leave its original (possibly hostile) password
      // usable after the real email owner signs in with Google.
      if (
        args.type === "oauth" &&
        args.provider.id === "google" &&
        profile.emailVerified === true &&
        email
      ) {
        const matches = await (ctx as MutationCtx).db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .take(2);
        if (matches.length > 1)
          throw new ConvexError(
            "Multiple accounts use this email. Ask your studio administrator to resolve them.",
          );
        if (matches[0]) {
          if (!matches[0].emailVerificationTime) {
            throw new ConvexError(
              "This email already has an unverified account. Sign in with your existing password or ask your administrator to verify and migrate it before using Google.",
            );
          }
          await ctx.db.patch(matches[0]._id, {
            emailVerificationTime: Date.now(),
          });
          await claimInvitesForUser(ctx, matches[0]._id);
          return matches[0]._id;
        }
      }
      if (!(await signupAllowed(ctx, email))) {
        throw new ConvexError(
          "Sign-ups are invite-only — ask your producer to invite this email.",
        );
      }
      const userId = await ctx.db.insert("users", {
        ...(email !== undefined ? { email } : {}),
        ...(profile.name !== undefined ? { name: profile.name } : {}),
        ...(profile.image !== undefined ? { image: profile.image } : {}),
        ...(profile.emailVerified === true
          ? { emailVerificationTime: Date.now() }
          : {}),
      });
      await claimInvitesForUser(ctx, userId);
      return userId;
    },
  },
});
