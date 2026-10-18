"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";

import {
  createApiTokenAction,
  listApiTokensAction,
  revokeApiTokenAction,
  type ApiTokenSummary,
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
} from "./settings-primitives";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  AI access                                                          */
/*                                                                     */
/*  Personal access tokens for the `/api/v1` API and the OrbitOS MCP   */
/*  server. The plaintext is shown once, straight after creation, and  */
/*  the panel says so — there is no way to see it again, only to       */
/*  revoke it and make another.                                        */
/* ------------------------------------------------------------------ */

function formatWhen(iso: string | null): string {
  if (!iso) return "Never used";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AiAccessSection() {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [canWrite, setCanWrite] = useState(true);
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listApiTokensAction();
    if (result.success) {
      setTokens(result.tokens);
      setLimit(result.limit);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

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
    const result = await createApiTokenAction({
      name,
      scopes: canWrite ? ["read", "write"] : ["read"],
    });
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

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const gated = limit === 0;
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
          your calendar, book meetings and pull reports, all under your name. Booking sends real invitations.
          It cannot delete anything. Treat a token like a password.
        </p>

        {gated ? (
          <p className="text-[13px] font-light text-ink-muted">
            AI access is on paid plans. Ask Internal Management to upgrade in Admin Tools.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name, e.g. Home assistant"
              maxLength={60}
              aria-label="Token name"
              className={`${SETTINGS_FIELD_CLASS} h-10`}
            />
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] text-ink-muted">
              <input
                type="checkbox"
                checked={canWrite}
                onChange={(e) => setCanWrite(e.target.checked)}
                className="accent-current"
              />
              Can make changes
            </label>
            <SettingsButton
              onClick={create}
              busy={creating}
              disabled={!name.trim() || full || loading}
              icon={Plus}
            >
              Create token
            </SettingsButton>
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
              <li key={token.id} className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium tracking-tight text-ink">{token.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-dim">
                    {token.hint} · {token.scopes.includes("write") ? "read & write" : "read only"} ·{" "}
                    {formatWhen(token.lastUsedAt)}
                  </p>
                </div>
                <SettingsButton
                  onClick={() => revoke(token.id)}
                  busy={revoking === token.id}
                  icon={Trash2}
                  variant={confirmRevoke === token.id ? "danger" : "quiet"}
                >
                  {confirmRevoke === token.id ? "Confirm revoke" : "Revoke"}
                </SettingsButton>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>

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
