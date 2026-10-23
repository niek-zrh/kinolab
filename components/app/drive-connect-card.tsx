"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Loader2,
  Plus,
  Star,
  Users,
} from "lucide-react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { openDrivePicker } from "@/lib/google-picker";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * Convex error messages can be multiline
 * ("[CONVEX M(...)] [Request ID: …] Server Error\nUncaught Error: …") —
 * surface only the human-readable line in toasts.
 */
export function firstErrorLine(message: string): string {
  const uncaught = message.match(/Uncaught (?:[A-Za-z]*Error): ?([^\n]*)/);
  if (uncaught && uncaught[1].trim()) return uncaught[1].trim();
  const first =
    message
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? "";
  const stripped = first.replace(/^(\[[^\]]*\]\s*)+/, "").trim();
  return stripped || "Something didn't work — try again";
}

/** Server permission/invariant errors must surface as toasts (conventions). */
export function showMutationError(e: unknown): void {
  toast.error(
    e instanceof Error
      ? firstErrorLine(e.message)
      : "Something didn't work — try again",
  );
}

/**
 * ConvexError carries the server's own text in .data; the wrapped .message
 * keeps the "[CONVEX …] Server Error" preamble. Prefer .data so long setup
 * errors (CONFIG_ERROR names the env vars and the Convex deployment) reach
 * the user intact instead of being cut down to a preamble.
 */
function driveErrorText(e: unknown): string {
  if (e instanceof ConvexError && typeof e.data === "string" && e.data.trim()) {
    return e.data.trim();
  }
  return e instanceof Error
    ? firstErrorLine(e.message)
    : "Something didn't work — try again";
}

/**
 * Drive env vars live on the CONVEX deployment, not the web container — the
 * classic misconfiguration. Match the shapes CONFIG_ERROR can arrive in so it
 * is rendered inline (persistent) rather than in a toast that self-dismisses
 * before anyone can read the fix.
 */
function isConfigError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not configured") ||
    m.includes("google_drive_client_id") ||
    m.includes("convex env")
  );
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/**
 * Drive hub connect card (spec §7.2) — shared by the setup wizard (/new,
 * step 2) and production settings. Walks through: connect my Google account
 * → choose where the hub lives → scaffold the folder tree → status card.
 */
export function DriveConnectCard({
  productionId,
  returnTo,
  canManage = true,
}: {
  productionId: Id<"productions">;
  returnTo: string;
  /** Only owners/producers may scaffold the hub (server enforces too). */
  canManage?: boolean;
}) {
  const status = useQuery(api.drive.connectionStatus, { productionId });
  const beginConnect = useMutation(api.drive.beginConnect);
  const setDefaultConnection = useMutation(api.drive.setDefaultConnection);
  const getPickerConfig = useAction(api.drive.getPickerConfig);
  const scaffoldHub = useAction(api.drive.scaffoldHub);

  const [connecting, setConnecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  // The account the next hub is created in; null = my default.
  const [chosenId, setChosenId] = useState<Id<"googleConnections"> | null>(null);

  /** Setup errors go inline (they need reading); the rest stay toasts. */
  const reportDriveError = (e: unknown) => {
    const message = driveErrorText(e);
    if (isConfigError(message)) setConfigError(message);
    else toast.error(message);
  };

  const connect = async () => {
    setConnecting(true);
    setConfigError(null);
    try {
      const { url } = await beginConnect({ returnTo });
      // Leaves the app: `connecting` stays true until the browser navigates.
      window.location.href = url;
    } catch (e) {
      setConnecting(false);
      reportDriveError(e);
    }
  };

  const usable = (status?.myConnections ?? []).filter((c) => !c.revoked);
  const defaultId = usable.find((c) => c.isDefault)?._id ?? usable[0]?._id ?? null;
  const activeId = chosenId !== null && usable.some((c) => c._id === chosenId) ? chosenId : defaultId;
  const replacing = status?.hub.connected === true;

  const scaffold = async (parentFolderId?: string) => {
    if (activeId === null) return;
    setCreating(true);
    try {
      await scaffoldHub({
        productionId,
        connectionId: activeId,
        ...(replacing ? { replace: true } : {}),
        ...(parentFolderId !== undefined ? { parentFolderId } : {}),
      });
      setJustCreated(true);
      setSwitching(false);
    } catch (e) {
      // scaffoldHub also throws the not-configured error (§7.2) — inline it.
      reportDriveError(e);
    } finally {
      setCreating(false);
    }
  };

  const pickFolderAndScaffold = async () => {
    if (activeId === null) return;
    setPicking(true);
    try {
      // The folder is picked in the account the hub will live in.
      const config = await getPickerConfig({ connectionId: activeId });
      const picked = await openDrivePicker(config, { foldersOnly: true });
      // null = closed without choosing; leave the card as it was.
      if (!picked || picked.length === 0) return;
      await scaffold(picked[0].id);
    } catch (e) {
      reportDriveError(e);
    } finally {
      // Always clears, so a Picker that failed to load doesn't leave
      // "Pick a folder…" dead for the rest of the session.
      setPicking(false);
    }
  };

  const makeDefault = async (connectionId: Id<"googleConnections">) => {
    try {
      await setDefaultConnection({ connectionId });
    } catch (e) {
      reportDriveError(e);
    }
  };

  const chooser = status && (
    <AccountChooser
      accounts={status.myConnections}
      activeId={activeId}
      onChoose={setChosenId}
      onMakeDefault={makeDefault}
      onConnectAnother={connect}
      connecting={connecting}
      creating={creating}
      picking={picking}
      onCreateInRoot={() => void scaffold()}
      onPickFolder={() => void pickFolderAndScaffold()}
      replacing={replacing}
      currentOwnerId={status.hub.ownerConnectionId ?? null}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-4 text-muted-foreground" /> Drive hub
        </CardTitle>
        <CardDescription>{copy.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            {/* (a) Drive not configured on the Convex deployment — inline and
                persistent (a toast would vanish before it can be acted on),
                and kept above the normal content so the retry stays reachable. */}
            {configError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {configError}
              </div>
            )}
            {status.hub.connected && status.hub.rootFolderId ? (
              <>
                <HubStatus
                  rootFolderId={status.hub.rootFolderId}
                  ownerEmail={status.hub.ownerEmail}
                  revoked={status.hub.revoked === true}
                  isHubOwner={status.hub.ownerIsMine === true}
                  justCreated={justCreated}
                  onReconnect={connect}
                  reconnecting={connecting}
                />
                {canManage && !switching && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start text-muted-foreground"
                    onClick={() => setSwitching(true)}
                  >
                    <Users className="size-3.5" /> Use a different Google account…
                  </Button>
                )}
                {canManage && switching && (
                  <div className="flex flex-col gap-2.5 rounded-lg border p-3">
                    <p className="text-sm">
                      A new folder tree is created in the account you choose.
                      Files already in the current hub stay where they are and
                      keep working; new uploads and picks go to the new hub.
                    </p>
                    {chooser}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      disabled={creating}
                      onClick={() => setSwitching(false)}
                    >
                      Keep the current account
                    </Button>
                  </div>
                )}
              </>
            ) : usable.length === 0 ? (
              // (b) no usable personal connection yet → send them through OAuth.
              <div className="flex flex-col items-start gap-2">
                {status.myConnection?.revoked && (
                  <p className="text-sm text-destructive">
                    {copy.errors.driveExpired}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Connect your Google account so Kinolab can create and organize the
                  production&apos;s folder tree in Drive.
                </p>
                <Button onClick={() => void connect()} disabled={connecting}>
                  {connecting && <Loader2 className="size-4 animate-spin" />}
                  {status.myConnection?.revoked
                    ? copy.actions.reconnectDrive
                    : copy.actions.connectDrive}
                </Button>
              </div>
            ) : canManage ? (
              // (c) connected, no hub yet → choose the account and where it lives.
              chooser
            ) : (
              <p className="text-sm text-muted-foreground">
                No Drive hub yet. An owner or producer can create one here.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Which of my Google accounts the hub is created in, and where. The default
 * is the first account I connected (a star marks it; any other can take the
 * flag); "Connect another" runs the Google consent flow again and the new
 * account appears here when it returns.
 */
function AccountChooser({
  accounts,
  activeId,
  onChoose,
  onMakeDefault,
  onConnectAnother,
  connecting,
  creating,
  picking,
  onCreateInRoot,
  onPickFolder,
  replacing,
  currentOwnerId,
}: {
  accounts: {
    _id: Id<"googleConnections">;
    email: string;
    revoked: boolean;
    isDefault: boolean;
  }[];
  activeId: Id<"googleConnections"> | null;
  onChoose: (id: Id<"googleConnections">) => void;
  onMakeDefault: (id: Id<"googleConnections">) => Promise<void>;
  onConnectAnother: () => Promise<void>;
  connecting: boolean;
  creating: boolean;
  picking: boolean;
  onCreateInRoot: () => void;
  onPickFolder: () => void;
  replacing: boolean;
  currentOwnerId: Id<"googleConnections"> | null;
}) {
  const active = accounts.find((a) => a._id === activeId);
  return (
    <div className="flex flex-col gap-2.5">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Google account for this production
        </legend>
        {accounts.map((account) => {
          const isCurrent = account._id === currentOwnerId;
          return (
            <label
              key={account._id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                account._id === activeId ? "border-foreground/40 bg-accent/40" : "border-border",
                (account.revoked || isCurrent) && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="hub-account"
                className="accent-foreground"
                checked={account._id === activeId}
                disabled={account.revoked || isCurrent}
                onChange={() => onChoose(account._id)}
              />
              <span className="min-w-0 flex-1 truncate">{account.email}</span>
              {account.isDefault ? (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Star className="size-3 fill-current" /> default
                </span>
              ) : (
                !account.revoked && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      void onMakeDefault(account._id);
                    }}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Make default
                  </button>
                )
              )}
              {account.revoked && (
                <span className="text-[10px] text-destructive">expired</span>
              )}
              {isCurrent && (
                <span className="text-[10px] text-muted-foreground">current hub</span>
              )}
            </label>
          );
        })}
      </fieldset>
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
        onClick={() => void onConnectAnother()}
        disabled={connecting}
      >
        {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        Connect another Google account
      </Button>
      {creating ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Creating folders…
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {active
              ? `Choose where the Hub lives in ${active.email}:`
              : "Choose where the Hub lives:"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={onCreateInRoot}
              disabled={picking || active === undefined}
            >
              <HardDrive className="size-4" /> {replacing ? "New hub in My Drive root" : "My Drive root"}
            </Button>
            <Button
              variant="outline"
              onClick={onPickFolder}
              disabled={picking || active === undefined}
            >
              {picking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderOpen className="size-4" />
              )}
              Pick a folder…
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function HubStatus({
  rootFolderId,
  ownerEmail,
  revoked,
  isHubOwner,
  justCreated,
  onReconnect,
  reconnecting,
}: {
  rootFolderId: string;
  ownerEmail?: string;
  revoked: boolean;
  /** Reconnecting re-runs Google's consent for one of MY accounts, so it only
   *  repairs the hub when its account is one of mine. */
  isHubOwner: boolean;
  justCreated: boolean;
  onReconnect: () => Promise<void>;
  reconnecting: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {justCreated && (
        <div className="flex items-center gap-2 rounded-lg border border-status-approved/25 bg-status-approved/10 p-3 text-sm text-status-approved">
          <CheckCircle2 className="size-4 shrink-0" />
          Hub created — the folder tree is ready in Drive.
        </div>
      )}
      {revoked && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            {isHubOwner
              ? copy.errors.driveExpired
              : `${copy.errors.driveExpired} Ask ${ownerEmail} to reconnect — the hub writes with that account.`}
          </span>
          {isHubOwner && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onReconnect()}
              disabled={reconnecting}
            >
              {reconnecting && <Loader2 className="size-3.5 animate-spin" />}
              Reconnect
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="font-medium">Hub connected</p>
          <p className="truncate text-muted-foreground">
            {ownerEmail ? `Connected by ${ownerEmail}` : "Connected"}
          </p>
        </div>
        <a
          href={driveFolderUrl(rootFolderId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          {copy.actions.openInDrive} <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
