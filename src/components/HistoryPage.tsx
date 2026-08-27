import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { gFav } from "@/lib/constants";
import { core, useBardoSelector } from "@/lib/useCore";
import { toast } from "@/lib/toast";
import type { HistoryEntry } from "@/lib/types";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function dateGroupLabel(ts: number) {
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  if (ts >= startOfToday) return "Today";
  if (ts >= startOfToday - 86400000) return "Yesterday";
  return new Date(ts).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function HistoryFav({ url }: { url: string }) {
  const [hidden, setHidden] = useState(false);
  let src = "";
  try {
    src = gFav(new URL(url).hostname);
  } catch {
  }
  return <img className="hp-fav" alt="" src={src} style={hidden ? { visibility: "hidden" } : undefined} onError={() => setHidden(true)} />;
}

interface HistoryPageProps {
  open: boolean;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
}

export function HistoryPage({ open, onClose, onOpenUrl }: HistoryPageProps) {
  const history = useBardoSelector((snapshot) => snapshot.history);
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    return history.filter(
      (h) =>
        !query ||
        hostOf(h.url).toLowerCase().includes(query) ||
        (h.title || "").toLowerCase().includes(query) ||
        h.url.toLowerCase().includes(query),
    );
  }, [history, q]);

  const rows: (HistoryEntry | { group: string })[] = [];
  let lastGroup: string | null = null;
  for (const h of items) {
    const group = dateGroupLabel(h.ts);
    if (group !== lastGroup) {
      lastGroup = group;
      rows.push({ group });
    }
    rows.push(h);
  }

  if (!open) return null;

  return (
    <div id="history-page" className={open ? "open" : ""} role="dialog" aria-modal="true" aria-label="Browsing history">
      <div className="hp-header">
        <button id="btn-history-back" className="nav-btn" title="Close history" onClick={onClose}>
          <Icon name="arrow-left" size={15} />
        </button>
        <h1>
          <Icon name="history" size={17} />
          History
        </h1>
        <div className="hp-search-wrap">
          <Icon name="search" size={14} anim="none" />
          <input
            type="text"
            id="hp-search"
            placeholder="Search history"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
        </div>
      </div>
      <div className="hp-body">
        <div className="hp-toolbar">
          <ConfirmButton
            className="hp-clear-btn"
            label="Clear browsing data"
            confirmLabel="Click again to clear all"
            onConfirm={() => {
              if (history.length === 0) return;
              const prior = core.clearHistory();
              toast.success("Browsing history cleared", {
                action: { label: "Undo", onClick: () => core.restoreHistory(prior) },
              });
            }}
          />
        </div>
        <div className="hp-list">
          {items.length === 0 ? (
            <p className="hp-empty">{q ? "No matching history" : "No browsing history yet"}</p>
          ) : (
            rows.map((row, i) =>
              "group" in row ? (
                <div key={"g" + i} className="hp-group-label">
                  {row.group}
                </div>
              ) : (
                <button
                  key={"h" + i}
                  className="hp-item"
                  title={hostOf(row.url)}
                  onClick={() => {
                    onClose();
                    onOpenUrl(row.url);
                  }}
                >
                  <span className="hp-time">
                    <Icon name="clock" size={12} anim="none" />
                    <span>{new Date(row.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </span>
                  <HistoryFav url={row.url} />
                  <span className="hp-main">
                    <span className="hp-title">{hostOf(row.url)}</span>
                    <span className="hp-url">{hostOf(row.url)}</span>
                  </span>
                  <span
                    className="hp-del"
                    title="Remove from history"
                    onClick={(e) => {
                      e.stopPropagation();
                      core.removeHistory(row);
                    }}
                  >
                    <Icon name="delete" size={12} />
                  </span>
                </button>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}
