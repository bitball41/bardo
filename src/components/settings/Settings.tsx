import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PANE_BY_ID, SIDEBAR_GROUPS, type PaneId } from "@/lib/panes";
import { cn } from "@/lib/utils";
import { SectionBody } from "./sections";
import { ThemesPane } from "./ThemeEditor";
import { ToolbarEditor } from "./ToolbarEditor";

const SEARCH_TERMS: Record<PaneId, string> = {
  themes: "theme colors colour contrast import export live preview dark light custom",
  appearance: "accent wallpaper background personalize image gradient",
  widgets: "widgets clock quick links notes weather date todo pomodoro battery new tab",
  layout: "tabs tab bar position sidebar vertical horizontal collapse",
  toolbar: "toolbar buttons shortcuts arrange reorder pin menu about:blank",
  search: "search proxy engine google bing brave startpage duckduckgo",
  bookmarks: "bookmarks folders reorder import export json pin new tab favicons open folder tabs",
  history: "history save browsing clear local data privacy",
  privacy: "privacy history local data clear session only restore tabs ask automatically never storage",
  cloaker: "cloak tab title favicon disguise canvas drive classroom about:blank launcher popup",
  safety: "panic key quick exit shortcut redirect escape emergency safe page",
  advanced: "proxy sherpa scramjet klystron engine rewrite cache streaming developer tools eruda compare faster",
  diagnostics: "health status connection network storage performance service worker event log troubleshoot",
};

export function Settings({
  open,
  onClose,
  onOpenHistory,
  onOpenDiagnostics,
}: {
  open: boolean;
  onClose: () => void;
  onOpenHistory: () => void;
  onOpenDiagnostics: () => void;
}) {
  const [pane, setPane] = useState<PaneId>("themes");
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return SIDEBAR_GROUPS.flatMap((group) => group.items).filter((item) =>
      `${item.label} ${item.desc} ${SEARCH_TERMS[item.id]}`.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div id="settings-overlay" className={open ? "open" : ""} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div id="settings-modal" role="dialog" aria-modal="true" aria-label="settings">
        <div className="sm-header">
          <span className="sm-title">
            <Icon name="settings" size={17} />
            settings
          </span>
          <button className="nav-btn" title="close settings" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        </div>

        <label className="sm-search">
          <Icon name="search" size={14} anim="none" />
          <input
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder="search"
            aria-label="search settings"
            autoFocus={false}
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="clear search">×</button>}
        </label>

        <div className="sm-body">
          <nav className="sm-sidebar">
            {matches ? (
              <div className="sm-group">
                <div className="sm-group-label">results</div>
                {matches.map((item) => (
                  <button key={item.id} className={cn("sm-tab", pane === item.id && "active")} onClick={() => setPane(item.id)}>
                    <Icon name={item.icon} size={13} anim={pane === item.id ? undefined : "none"} />
                    <span><strong>{item.label}</strong><small>{item.desc}</small></span>
                  </button>
                ))}
                {matches.length === 0 && <p className="sm-search-empty">nothing matches “{query.trim()}”</p>}
              </div>
            ) : SIDEBAR_GROUPS.map((g) => (
              <div key={g.group} className="sm-group">
                <div className="sm-group-label">{g.group}</div>
                {g.items.map((t) => (
                  <button key={t.id} className={cn("sm-tab", pane === t.id && "active")} onClick={() => setPane(t.id)}>
                    <Icon name={t.icon} size={13} anim={pane === t.id ? undefined : "none"} />
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="sm-content">
            <div className="sm-pane-header">
              <Icon name={PANE_BY_ID[pane].icon} size={16} anim="none" />
              <div>
                <div className="sm-pane-title">{PANE_BY_ID[pane].label}</div>
                <div className="sm-pane-desc">{PANE_BY_ID[pane].desc}</div>
              </div>
            </div>

            {pane === "themes" ? (
              <ThemesPane />
            ) : pane === "toolbar" ? (
              <ToolbarEditor />
            ) : (
              <SectionBody
                pane={pane}
                onOpenHistory={() => {
                  onClose();
                  onOpenHistory();
                }}
                onOpenDiagnostics={() => {
                  onClose();
                  onOpenDiagnostics();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
