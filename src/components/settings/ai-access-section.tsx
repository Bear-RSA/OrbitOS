"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, Check, Copy, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";

import {
  createApiTokenAction,
  listApiActivityAction,
  listApiTokensAction,
  listWorkspaceTokensAction,
  revokeApiTokenAction,
  setWorkspaceApiAccessAction,
  type ApiAuditEntry,
  type ApiTokenSummary,
  type WorkspaceTokenSummary,
} from "@/app/actions/api-tokens";
import {
  DashboardCard,
  CardHeader,
  StatusChip,
} from "@/components/dashboard/dashboard-card";
import {
  FormNotice,
  SettingsButton,
  SETTINGS_FIELD_CLASS,
  ToggleRow,
} from "./settings-primitives";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  AI access                                                          */
/*                                                                     */
/*  Personal access tokens for the `/api/v1` API and the OrbitOS MCP   */
/*  server. The plaintext is shown once, straight after creation, and  */
/*  the panel says so — there is no way to see it again, only to       */
/*  revoke it and make another.                                        */
/*                                                                     */
/*  Owners also get the workspace view: every token, who holds it, a   */
/*  revoke on each, and the switch that turns the API off for all.     */
/* ------------------------------------------------------------------ */

const LIFETIMES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

function formatWhen(iso: string | null, empty = "Never used"): string {
  if (!iso) return empty;
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(iso: string | null): string {
  if (!iso) return "no expiry";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function access(scopes: ApiTokenSummary["scopes"]): string {
  if (scopes.includes("guests")) return "read, write & outside email";
  return scopes.includes("write") ? "read & write" : "read only";
}

/** "POST /api/v1/events/abc/cancel" → "Cancel meeting", for the activity list. */
function describe(entry: ApiAuditEntry): string {
  const path = entry.path.replace(/^\/api\/v1\//, "");
  if (path === "tasks") return "Created a task";
  if (/^tasks\/[^/]+\/notes$/.test(path)) return "Added a task note";
  if (/^tasks\/[^/]+$/.test(path)) return "Changed a task";
  if (path === "events") return "Booked a meeting";
  if (/^events\/[^/]+\/cancel$/.test(path)) return "Cancelled a meeting";
  if (/^events\/[^/]+\/rsvp$/.test(path)) return "Answered an invitation";
  if (/^events\/[^/]+$/.test(path)) return "Changed a meeting";
  return `${entry.method} ${path}`;
}

/** One row of a token list, own or workspace. */
function TokenRow({
  token,
  holder,
  confirming,
  busy,
  onRevoke,
}: {
  token: ApiTokenSummary;
  holder?: string;
  confirming: boolean;
  busy: boolean;
  onRevoke: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium tracking-tight text-ink">
          {holder ? `${holder} · ` : ""}
          {token.name}
          {token.expired && <span className="ml-2 text-[12px] font-normal text-orbit-red">Expired</span>}
        </p>
        <p className="mt-1 font-mono text-[11px] text-ink-dim">
          {token.hint} · {access(token.scopes)} · {token.expired ? "expired" : "expires"}{" "}
          {formatDay(token.expiresAt)} · {formatWhen(token.lastUsedAt)}
        </p>
      </div>
      <SettingsButton
        onClick={onRevoke}
        busy={busy}
        icon={Trash2}
        variant={confirming ? "danger" : "quiet"}
      >
        {confirming ? "Confirm revoke" : "Revoke"}
      </SettingsButton>
    </li>
  );
}

export function AiAccessSection({ isOwner }: { isOwner: boolean }) {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [activity, setActivity] = useState<ApiAuditEntry[]>([]);
  const [workspace, setWorkspace] = useState<{ enabled: boolean; tokens: WorkspaceTokenSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [canWrite, setCanWrite] = useState(true);
  const [canEmailGuests, setCanEmailGuests] = useState(false);
  const [lifetimeDays, setLifetimeDays] = useState(90);
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    const [own, recent, all] = await Promise.all([
      listApiTokensAction(),
      listApiActivityAction(),
      isOwner ? listWorkspaceTokensAction() : Promise.resolve(null),
    ]);
    if (own.success) {
      setTokens(own.tokens);
      setLimit(own.limit);
    } else {
      setError(own.error);
    }
    if (recent.success) setActivity(recent.entries);
    if (all?.success) setWorkspace({ enabled: all.enabled, tokens: all.tokens });
    setLoading(false);
  }, [isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not reach the clipboard. Select the text and copy it manually.");
    }
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    const scopes: ApiTokenSummary["scopes"] = !canWrite
      ? ["read"]
      : canEmailGuests
        ? ["read", "write", "guests"]
        : ["read", "write"];
    const result = await createApiTokenAction({ name, scopes, lifetimeDays });
    if (result.success) {
      setFresh(result.token);
      setName("");
      await load();
    } else {
      setError(result.error);
    }
    setCreating(false);
  };

  const revoke = async (id: string) => {
    if (confirmRevoke !== id) {
      setConfirmRevoke(id);
      return;
    }
    setRevoking(id);
    setError(null);
    const result = await revokeApiTokenAction({ id });
    if (!result.success) setError(result.error ?? "Could not revoke the token.");
    setRevoking(null);
    setConfirmRevoke(null);
    await load();
  };

  const toggleWorkspace = async (enabled: boolean) => {
    setSwitching(true);
    setError(null);
    const result = await setWorkspaceApiAccessAction({ enabled });
    if (!result.success) setError(result.error ?? "Could not change AI access.");
    setSwitching(false);
    await load();
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const gated = limit === 0;
  const switchedOff = workspace?.enabled === false;
  const full = limit !== null && limit > 0 && tokens.length >= limit;

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        orbitos: {
          command: "node",
          args: ["/path/to/orbitos-mcp/index.mjs"],
          env: { ORBITOS_URL: origin, ORBITOS_TOKEN: fresh ?? "orb_…" },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="flex flex-col gap-6">
      <DashboardCard interactive={false}>
        <CardHeader
          title="Access tokens"
          icon={KeyRound}
          meta={
            <StatusChip
              label={gated ? "Paid plans" : limit === null ? "…" : `${tokens.length} of ${limit}`}
              tone={gated ? "neutral" : "positive"}
            />
          }
        />

        <p className="mb-6 max-w-[62ch] text-[13px] font-light leading-relaxed text-ink-muted">
          A token lets an AI assistant you run act as you. It can manage your tasks, check
          your calendar, book meetings and pull reports, all under your name. It cannot delete
          anything. Treat a token like a password.
        </p>

        {gated ? (
          <p className="text-[13px] font-light text-ink-muted">
            AI access is on paid plans. Ask Internal Management to upgrade in Admin Tools.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name, e.g. Home assistant"
                maxLength={60}
                aria-label="Token name"
                className={`${SETTINGS_FIELD_CLASS} h-10`}
              />
              <select
                value={lifetimeDays}
                onChange={(e) => setLifetimeDays(Number(e.target.value))}
                aria-label="Expires after"
                className={`${SETTINGS_FIELD_CLASS} h-10 sm:w-40`}
              >
                {LIFETIMES.map((option) => (
                  <option key={option.days} value={option.days}>
                    Expires in {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 text-[12px] text-ink-muted">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={canWrite}
                  onChange={(e) => {
                    setCanWrite(e.target.checked);
                    if (!e.target.checked) setCanEmailGuests(false);
                  }}
                  className="accent-current"
                />
                Can make changes (create tasks, book meetings)
              </label>
              <label
                className={cn(
                  "flex items-center gap-2",
                  canWrite ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                )}
              >
                <input
                  type="checkbox"
                  checked={canEmailGuests}
                  disabled={!canWrite}
                  onChange={(e) => setCanEmailGuests(e.target.checked)}
                  className="accent-current"
                />
                Can invite people outside the workspace (sends them email)
              </label>
            </div>

            <div>
              <SettingsButton
                onClick={create}
                busy={creating}
                disabled={!name.trim() || full || loading || switchedOff}
                icon={Plus}
              >
                Create token
              </SettingsButton>
            </div>
          </div>
        )}

        {fresh && (
          <div className="mt-6 rounded-xl bg-surface-raised p-4 ring-1 ring-inset ring-orbit-green/25">
            <p className="mb-3 text-[13px] font-medium text-ink">
              Copy this token now. You won&apos;t see it again.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                readOnly
                value={fresh}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="New token"
                className={`${SETTINGS_FIELD_CLASS} h-10 font-mono text-[12px]`}
              />
              <SettingsButton
                onClick={() => copy(fresh, "fresh")}
                icon={copied === "fresh" ? Check : Copy}
                variant="quiet"
              >
                {copied === "fresh" ? "Copied" : "Copy"}
              </SettingsButton>
            </div>
          </div>
        )}

        <FormNotice tone="error">{error}</FormNotice>

        {tokens.length > 0 && (
          <ul className="mt-8 flex flex-col divide-y divide-line/[0.05] border-t border-line/[0.06]">
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                confirming={confirmRevoke === token.id}
                busy={revoking === token.id}
                onRevoke={() => revoke(token.id)}
              />
            ))}
          </ul>
        )}
      </DashboardCard>

      <DashboardCard interactive={false}>
        <CardHeader title="Recent changes by your tokens" icon={Activity} />
        {activity.length === 0 ? (
          <p className="text-[13px] font-light text-ink-muted">
            Nothing yet. Every change an assistant makes with your tokens is listed here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/[0.05]">
            {activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <span className="text-[13px] text-ink">{describe(entry)}</span>
                <span className="text-[12px] text-ink-dim">{entry.tokenName}</span>
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    entry.status < 400 ? "text-ink-dim" : "text-orbit-red"
                  )}
                >
                  {entry.status < 400 ? "done" : `refused (${entry.status})`}
                </span>
                <span className="ml-auto text-[12px] text-ink-dim">{formatWhen(entry.at, "")}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>

      {isOwner && workspace && (
        <DashboardCard interactive={false}>
          <CardHeader
            title="Workspace AI access"
            icon={ShieldAlert}
            meta={
              <StatusChip
                label={workspace.enabled ? "On" : "Off"}
                tone={workspace.enabled ? "positive" : "neutral"}
              />
            }
          />
          <ToggleRow
            id="workspace-ai-access"
            title="Allow AI access in this workspace"
            description="Off stops every token in the workspace within 30 seconds. Tokens are kept, so switching back on restores everyone's setup."
            checked={workspace.enabled}
            busy={switching}
            onChange={toggleWorkspace}
          />

          <h4 className="mb-1 mt-6 text-[13px] font-medium tracking-tight text-ink">
            Every token in the workspace
          </h4>
          {workspace.tokens.length === 0 ? (
            <p className="text-[13px] font-light text-ink-muted">No one has created a token.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line/[0.05]">
              {workspace.tokens.map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  holder={token.holderName}
                  confirming={confirmRevoke === token.id}
                  busy={revoking === token.id}
                  onRevoke={() => revoke(token.id)}
                />
              ))}
            </ul>
          )}
        </DashboardCard>
      )}

      <DashboardCard interactive={false}>
        <CardHeader title="Connect your assistant" icon={Bot} />
        <p className="mb-4 max-w-[62ch] text-[13px] font-light leading-relaxed text-ink-muted">
          Assistants that speak MCP (Claude Desktop, LM Studio, Open WebUI and others) can use the
          OrbitOS MCP server. Add this to the assistant&apos;s MCP settings:
        </p>
        <div className="relative">
          <pre
            className={cn(
              "overflow-x-auto rounded-xl bg-surface-raised p-4 font-mono text-[11px] leading-relaxed text-ink",
              "ring-1 ring-inset ring-line/[0.06]"
            )}
          >
            {mcpConfig}
          </pre>
          <button
            type="button"
            onClick={() => copy(mcpConfig, "config")}
            aria-label="Copy MCP settings"
            className="absolute right-3 top-3 rounded-lg p-2 text-ink-dim transition-colors hover:bg-surface-hover hover:text-ink"
          >
            {copied === "config" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="mt-4 max-w-[62ch] text-[13px] font-light leading-relaxed text-ink-muted">
          Anything else can call the API directly at{" "}
          <span className="font-mono text-[12px] text-ink">{origin}/api/v1</span> with the header{" "}
          <span className="font-mono text-[12px] text-ink">Authorization: Bearer &lt;token&gt;</span>.
        </p>
      </DashboardCard>
    </div>
  );
}
