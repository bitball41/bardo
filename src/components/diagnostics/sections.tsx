import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { ENGINES } from "@/lib/constants";
import type { DiagLevel } from "@/lib/diagnostics";
import { core } from "@/lib/useCore";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  type DiagnosticsData,
  type HealthLevel,
  type SWState,
} from "@/lib/useDiagnostics";
import { DiagActions, DiagCard, DiagEmpty, DiagRow, Meter } from "./primitives";

function connectionStatus(d: DiagnosticsData): { label: string; tone: HealthLevel } {
  if (d.ctrlReady) return { label: "Connected", tone: "ok" };
  if (d.statusWarn) return { label: "Disconnected", tone: "critical" };
  return { label: "Connecting…", tone: "warn" };
}

function serverIdentifier(d: DiagnosticsData): string {
  if (d.wispUrl) {
    try {
      return new URL(d.wispUrl).hostname;
    } catch {
      return d.wispUrl;
    }
  }
  return d.engine.kind === "server" ? "This device's Bardo server" : "—";
}

function protocolLabel(d: DiagnosticsData): string {
  return d.engine.kind === "server" ? "HTTPS (server-side rewrite)" : "WebSocket (Wisp)";
}

export function ConnectionSection({ d }: { d: DiagnosticsData }) {
  const status = connectionStatus(d);
  return (
    <DiagCard icon="link" title="Connection" status={status.tone} statusLabels={{ ok: "Connected", warn: "Connecting", critical: "Disconnected" }}>
      <DiagRow label="Status" value={status.label} valueTone={status.tone} />
      <DiagRow label="Active proxy engine" value={d.engine.name} />
      <DiagRow label="Server" value={serverIdentifier(d)} />
      <DiagRow label="Protocol" value={protocolLabel(d)} />
      <DiagRow label="Estimated latency" value={d.network.latencyMs != null ? `${d.network.latencyMs} ms` : "Measuring…"} />
      <DiagRow label="Session duration" value={formatDuration(d.sessionDurationMs)} />
      <DiagRow label="Last successful connection" value={formatRelativeTime(d.lastConnectedAt)} />
      {status.tone !== "ok" && (
        <>
          {d.status && <p className="dx-note">{d.status}</p>}
          <DiagActions>
            <button
              className="action-btn"
              onClick={() => {
                toast.info("Reconnecting…");
                core.restartEngine();
              }}
            >
              <Icon name="refresh-ccw" size={13} /> Retry connection
            </button>
          </DiagActions>
        </>
      )}
    </DiagCard>
  );
}

function engineHealth(d: DiagnosticsData): { label: string; tone: HealthLevel } {
  if (d.ctrlReady) return { label: "Running normally", tone: "ok" };
  if (d.statusWarn) return { label: `Failed — ${d.status || "unknown error"}`, tone: "critical" };
  return { label: "Starting…", tone: "warn" };
}

export function EngineSection({ d }: { d: DiagnosticsData }) {
  const health = engineHealth(d);
  const fallbacks = ENGINES.filter((e) => e.id !== d.engine.id);
  return (
    <DiagCard icon="cpu" title="Proxy Engine" subtitle={d.engine.name} status={health.tone} statusLabels={{ ok: "Healthy", warn: "Starting", critical: "Failed" }}>
      <DiagRow label="Engine" value={d.engine.name} />
      <DiagRow label="Version" value={d.engine.version} />
      <DiagRow label="Health" value={health.label} valueTone={health.tone} />
      <DiagRow label="Runs" value={d.engine.kind === "client" ? "In your browser" : "On Bardo's server"} />
      <DiagRow label="Restart count" value={d.restartInfo.count} />
      <DiagRow label="Last restart" value={formatRelativeTime(d.restartInfo.lastAt)} />
      <DiagActions>
        <button
          className="action-btn"
          onClick={() => {
            toast.info(`Restarting ${d.engine.name}…`);
            core.restartEngine();
          }}
        >
          <Icon name="refresh-ccw" size={13} /> Restart engine
        </button>
      </DiagActions>
      {fallbacks.length > 0 && (
        <>
          <div className="pane-label" style={{ marginTop: 14 }}>Switch engine</div>
          <div className="dx-fallback-grid">
            {fallbacks.map((e) => (
              <button
                key={e.id}
                className="action-btn"
                onClick={() => {
                  toast.info(`Switching to ${e.name}…`);
                  core.setSetting("engine", e.id);
                }}
              >
                {e.name}
              </button>
            ))}
          </div>
        </>
      )}
    </DiagCard>
  );
}

const SW_STATE_LABEL: Record<SWState, string> = {
  activated: "Active",
  installing: "Installing…",
  waiting: "Waiting to activate",
  none: "Not registered",
  unsupported: "Not supported",
};

function swHealth(d: DiagnosticsData): HealthLevel {
  if (!d.sw.supported) return "critical";
  if (d.sw.updateAvailable) return "warn";
  if (!d.sw.matched && d.ctrlReady) return "warn";
  return "ok";
}

export function ServiceWorkerSection({ d }: { d: DiagnosticsData }) {
  const tone = swHealth(d);
  const [busy, setBusy] = useState(false);

  const checkForUpdates = async () => {
    if (!("serviceWorker" in navigator)) {
      toast.error("Service workers aren't supported in this browser");
      return;
    }
    setBusy(true);
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      const reg = regs.find((r) => r.scope.includes(d.engine.swScope));
      if (!reg) {
        toast.error("No active service worker to update");
        return;
      }
      await reg.update();
      toast.success("Checked for updates");
    } catch {
      toast.error("Couldn't check for updates");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DiagCard icon="shield" title="Service Worker" status={tone}>
      <DiagRow label="Registration" value={d.sw.matched ? "Registered" : "Not registered"} valueTone={d.sw.matched ? "ok" : "warn"} />
      <DiagRow label="Active status" value={SW_STATE_LABEL[d.sw.state]} />
      <DiagRow label="Version" value={d.engine.version} />
      <DiagRow label="Controls this tab" value={d.sw.controlling ? "Yes" : "No — reload to activate"} valueTone={d.sw.controlling ? "ok" : "warn"} />
      <DiagRow label="Cache health" value={d.sw.controlling ? "Healthy" : "Needs a reload"} valueTone={d.sw.controlling ? "ok" : "warn"} />
      <DiagRow label="Updates" value={d.sw.updateAvailable ? "Update ready" : "Up to date"} valueTone={d.sw.updateAvailable ? "warn" : "ok"} />
      <DiagActions>
        <button className="action-btn" disabled={busy || !d.sw.matched} onClick={checkForUpdates}>
          <Icon name="refresh-ccw" size={13} /> Check for updates
        </button>
        {d.sw.updateAvailable && (
          <button className="action-btn" onClick={() => window.location.reload()}>
            Refresh to apply
          </button>
        )}
      </DiagActions>
    </DiagCard>
  );
}

function connectionQuality(ms: number | null): { label: string; tone: HealthLevel } {
  if (ms == null) return { label: "Unknown", tone: "warn" };
  if (ms < 150) return { label: "Excellent", tone: "ok" };
  if (ms < 400) return { label: "Good", tone: "ok" };
  if (ms < 900) return { label: "Fair", tone: "warn" };
  return { label: "Poor", tone: "critical" };
}

export function NetworkSection({ d }: { d: DiagnosticsData }) {
  const quality = connectionQuality(d.network.latencyMs);
  const tone: HealthLevel = !d.network.online ? "critical" : quality.tone === "critical" ? "warn" : quality.tone;
  return (
    <DiagCard icon="wifi" title="Network" status={tone} defaultOpen={false}>
      <DiagRow label="Online" value={d.network.online ? "Yes" : "No"} valueTone={d.network.online ? "ok" : "critical"} />
      <DiagRow
        label="Estimated latency"
        value={d.network.latencyFailed ? "Couldn't measure" : d.network.latencyMs != null ? `${d.network.latencyMs} ms` : "Measuring…"}
      />
      <DiagRow label="Connection quality" value={quality.label} valueTone={quality.tone} />
      <DiagRow label="Connection type" value={d.network.effectiveType ?? "Unknown"} />
      {d.network.saveData && <DiagRow label="Data saver" value="On" />}
    </DiagCard>
  );
}

export function StorageSection({ d }: { d: DiagnosticsData }) {
  const { usageBytes, quotaBytes, breakdown, supported } = d.storage;
  const ratio = usageBytes != null && quotaBytes ? usageBytes / quotaBytes : 0;
  const tone: HealthLevel = ratio > 0.9 ? "warn" : "ok";
  const canTrim = d.historyCount > 100;

  const exportData = () => {
    const dump: Record<string, unknown> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("bardo-")) continue;
        const raw = localStorage.getItem(key);
        try {
          dump[key] = raw ? JSON.parse(raw) : raw;
        } catch {
          dump[key] = raw;
        }
      }
    } catch {
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bardo-data-export.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    toast.success("Exported your Bardo data");
  };

  return (
    <DiagCard icon="database" title="Storage" status={tone} defaultOpen={false}>
      {supported && usageBytes != null && quotaBytes ? (
        <>
          <Meter ratio={ratio} tone={tone} />
          <p className="dx-note">
            {formatBytes(usageBytes)} of {formatBytes(quotaBytes)} used (approximate)
          </p>
        </>
      ) : (
        <p className="dx-note">Your browser doesn't report a storage total — showing what Bardo can measure directly.</p>
      )}
      <div className="dx-breakdown">
        {breakdown.map((item) => (
          <div className="dx-breakdown-row" key={item.label}>
            <span>{item.label}</span>
            <span>{formatBytes(item.bytes)}</span>
          </div>
        ))}
      </div>
      <DiagActions>
        <ConfirmButton className="action-btn" label="Clear cache & restart" confirmLabel="Click again to clear cache" icon="refresh-ccw" onConfirm={() => core.forceReload()} />
        <ConfirmButton
          className="action-btn"
          label="Clear saved session"
          confirmLabel="Click again to clear"
          icon="delete"
          onConfirm={() => {
            core.clearSavedSession();
            toast.success("Saved session cleared");
          }}
        />
        {canTrim && (
          <button
            className="action-btn"
            onClick={() => {
              const removed = core.trimHistory(100);
              if (removed) toast.success(`Trimmed ${removed} old history entries`);
            }}
          >
            Trim old history
          </button>
        )}
        <button className="action-btn" onClick={exportData}>
          <Icon name="copy" size={13} /> Export all data
        </button>
      </DiagActions>
    </DiagCard>
  );
}

export function RuntimeSection({ d }: { d: DiagnosticsData }) {
  const openTabs = d.tabs.length;
  return (
    <DiagCard icon="layers" title="Runtime" status="ok" defaultOpen={false}>
      <DiagRow label="Toolbar" value={d.toolbarCount > 0 ? "Active" : "Inactive"} valueTone={d.toolbarCount > 0 ? "ok" : undefined} />
      <DiagRow label="Tabs" value={`${openTabs} open${d.sleepingTabs ? `, ${d.sleepingTabs} sleeping` : ""}`} valueTone={openTabs > 0 ? "ok" : undefined} />
      <DiagRow label="History" value={d.historyEnabled ? "Active" : "Paused"} valueTone={d.historyEnabled ? "ok" : undefined} />
      <DiagRow
        label="Bookmarks"
        value={d.bookmarksVisible ? "Active" : d.bookmarksCount > 0 ? "Sleeping" : "Inactive"}
        valueTone={d.bookmarksVisible ? "ok" : d.bookmarksCount > 0 ? "warn" : undefined}
      />
      <DiagRow label="Widgets" value={d.widgetsActive ? "Active" : "Inactive"} valueTone={d.widgetsActive ? "ok" : undefined} />
      <DiagRow label="Developer tools" value={d.erudaEnabled ? "Active" : "Inactive"} valueTone={d.erudaEnabled ? "ok" : undefined} />
      <DiagRow label="Settings" value="Sleeping — loads when opened" />
    </DiagCard>
  );
}

function performanceRating(d: DiagnosticsData): { label: string; tone: HealthLevel } {
  let score = 0;
  if (d.performance.memoryUsedMb != null && d.performance.memoryLimitMb) {
    const ratio = d.performance.memoryUsedMb / d.performance.memoryLimitMb;
    if (ratio > 0.85) score += 2;
    else if (ratio > 0.6) score += 1;
  }
  if (d.tabs.length > 25) score += 2;
  else if (d.tabs.length > 12) score += 1;
  if (score >= 3) return { label: "Fair", tone: "warn" };
  if (score >= 1) return { label: "Good", tone: "ok" };
  return { label: "Great", tone: "ok" };
}

export function PerformanceSection({ d }: { d: DiagnosticsData }) {
  const rating = performanceRating(d);
  return (
    <DiagCard icon="gauge" title="Performance" status={rating.tone} statusLabels={{ ok: rating.label, warn: rating.label }} defaultOpen={false}>
      <DiagRow label="Startup time" value={d.performance.startupMs != null ? `${(d.performance.startupMs / 1000).toFixed(1)}s` : "Unknown"} />
      <DiagRow
        label="Memory usage"
        value={
          d.performance.memoryUsedMb != null && d.performance.memoryLimitMb
            ? `${d.performance.memoryUsedMb} MB / ${d.performance.memoryLimitMb} MB`
            : "Not available in this browser"
        }
      />
      <DiagRow label="Active tabs" value={d.tabs.length} />
      <DiagRow label="Sleeping tabs (cached, using no memory)" value={d.sleepingTabs} />
      <DiagRow label="Animation mode" value={d.performance.animationMode === "full" ? "Full" : d.performance.animationMode === "reduced" ? "Reduced" : "Off"} />
      <DiagRow label="Overall rating" value={rating.label} valueTone={rating.tone} />
    </DiagCard>
  );
}

const LEVEL_ICON: Record<DiagLevel, IconName> = { success: "check", info: "history", warn: "badge-alert", error: "badge-alert" };

export function EventLogSection({ d }: { d: DiagnosticsData }) {
  const entries = [...d.log].reverse();
  return (
    <DiagCard icon="list" title="Event Log" status="ok" defaultOpen={false} statusLabels={{ ok: String(entries.length) }}>
      {entries.length === 0 ? (
        <DiagEmpty icon="list" text="No activity yet." />
      ) : (
        <div className="dx-log">
          {entries.map((e) => (
            <div className={cn("dx-log-row", `dx-log-row-${e.level}`)} key={e.id}>
              <Icon name={LEVEL_ICON[e.level]} size={13} anim="none" />
              <span className="dx-log-message">{e.message}</span>
              <span className="dx-log-time">{formatRelativeTime(e.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </DiagCard>
  );
}
