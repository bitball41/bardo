import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { ACCENTS, ENGINES, RECOMMENDED_THEMES, THEME_COLUMNS, WALLPAPER_KEY } from "@/lib/constants";
import type { PaneId } from "@/lib/panes";
import { toast } from "@/lib/toast";
import { core, useBardoSelector } from "@/lib/useCore";
import { useDiagnostics } from "@/lib/useDiagnostics";
import type { CustomTheme, Settings as SettingsType, TabPosition, ThemeName } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-wrap">
      <input type="checkbox" className="toggle-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}

export function ToggleRow({
  name,
  hint,
  k,
  s,
  icon,
}: {
  name: string;
  hint?: string;
  k: keyof SettingsType;
  s: SettingsType;
  icon?: IconName;
}) {
  return (
    <label className="setting-row toggle-row" style={{ marginBottom: 10 }}>
      <div className="setting-info">
        <span className={cn("setting-name", icon && "setting-name-icon")}>
          {icon && <Icon name={icon} size={14} />}
          {name}
        </span>
        {hint && <span className="setting-hint">{hint}</span>}
      </div>
      <Toggle checked={s[k] as boolean} onChange={(v) => core.setSetting(k, v as never)} />
    </label>
  );
}

const CLOAKS = [
  ["none", "none"],
  ["canvas", "Canvas"],
  ["gdrive", "Google Drive"],
  ["canva", "Canva"],
  ["classlink", "ClassLink"],
  ["blooket", "Blooket"],
  ["classroom", "Classroom"],
  ["docs", "Google Docs"],
] as const;

function compressWallpaper(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 2048;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const maxEncodedSize = 1_800_000;
      let quality = 0.8;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > maxEncodedSize && quality > 0.4) {
        quality -= 0.1;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (data.length > maxEncodedSize) reject(new Error("too large"));
      else resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

const TAB_POS_SVG: Record<TabPosition, ReactNode> = {
  top: (
    <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="2.5" />
      <rect x="0.75" y="0.75" width="38.5" height="7.5" rx="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="0.75" y1="8.25" x2="39.25" y2="8.25" />
    </svg>
  ),
  bottom: (
    <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="2.5" />
      <rect x="0.75" y="21.75" width="38.5" height="7.5" rx="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="0.75" y1="21.75" x2="39.25" y2="21.75" />
    </svg>
  ),
  left: (
    <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="2.5" />
      <rect x="0.75" y="0.75" width="12" height="28.5" rx="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="12.75" y1="0.75" x2="12.75" y2="29.25" />
    </svg>
  ),
  right: (
    <svg viewBox="0 0 40 30" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="2.5" />
      <rect x="27.25" y="0.75" width="12" height="28.5" rx="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="27.25" y1="0.75" x2="27.25" y2="29.25" />
    </svg>
  ),
};

export interface ThemesSectionProps {
  onEditTheme?: (theme: CustomTheme) => void;
  onNewTheme?: () => void;
}

export function ThemesSection({ onEditTheme, onNewTheme }: ThemesSectionProps) {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const customThemes = useBardoSelector((snapshot) => snapshot.customThemes);

  const themeBtn = (t: (typeof RECOMMENDED_THEMES)[number]) => {
    const active = s.theme === t.id;
    return (
      <button
        key={t.id}
        className={cn("theme-btn theme-preview", active && "active")}
        style={{
          background: t.surface,
          color: t.text,
          borderColor: active ? t.accent : t.border,
          boxShadow: active ? `0 0 0 1px ${t.accent}` : undefined,
        }}
        onClick={() => core.setSetting("theme", t.id as ThemeName)}
      >
        <span className="theme-dot" style={{ background: t.accent }} />
        {t.label}
      </button>
    );
  };

  return (
    <div className="theme-groups">
      {(customThemes.length > 0 || onNewTheme) && (
        <div className="theme-section">
          <div className="theme-subhead">yours</div>
          <div className="theme-rec-grid">
            {customThemes.map((t) => {
              const active = s.theme === t.id;
              return (
                <div key={t.id} className="custom-theme-wrap">
                  <button
                    className={cn("theme-btn theme-preview custom-theme-btn", active && "active")}
                    style={{
                      background: t.colors.surface,
                      color: t.colors.text,
                      borderColor: active ? t.colors.accent : t.colors.border,
                      boxShadow: active ? `0 0 0 1px ${t.colors.accent}` : undefined,
                    }}
                    onClick={() => core.setSetting("theme", t.id)}
                  >
                    <span className="theme-dot" style={{ background: t.colors.accent }} />
                    <span className="custom-theme-name">{t.name}</span>
                  </button>
                  {onEditTheme && (
                    <button
                      className="custom-theme-edit"
                      title={`Edit ${t.name}`}
                      aria-label={`Edit ${t.name}`}
                      onClick={() => onEditTheme(t)}
                    >
                      <Icon name="square-pen" size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            {onNewTheme && (
              <button className="theme-btn theme-new-btn" onClick={onNewTheme}>
                <Icon name="plus" size={13} />
                new
              </button>
            )}
          </div>
        </div>
      )}
      <div className="theme-section">
        <div className="theme-subhead">picks</div>
        <div className="theme-rec-grid">{RECOMMENDED_THEMES.map(themeBtn)}</div>
      </div>
      {(["color", "neutral"] as const).map((grp) => (
        <div key={grp} className="theme-section">
          <div className="theme-subhead">{grp === "neutral" ? "quiet" : "color"}</div>
          <div className="theme-columns">
            {THEME_COLUMNS.map((col) => (
              <div key={col.mode} className="theme-col">
                <div className="theme-col-head">{col.head.toLowerCase()}</div>
                {col.themes.filter((t) => t.group === grp).map(themeBtn)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppearanceSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const [hasImg, setHasImg] = useState(() => {
    try {
      return !!localStorage.getItem(WALLPAPER_KEY);
    } catch {
      return false;
    }
  });
  const [wallpaperErr, setWallpaperErr] = useState(false);

  return (
    <>
      <div className="pane-label">accent</div>
      <div className="accent-row">
        <button className={cn("accent-swatch", !s.accent && "active")} title="Theme default" onClick={() => core.setSetting("accent", "")}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 8h10" />
            <path d="M8 3v10" />
          </svg>
        </button>
        {ACCENTS.map((a) => (
          <button
            key={a.value}
            className={cn("accent-swatch", s.accent === a.value && "active")}
            style={{ background: a.value }}
            title={a.title}
            onClick={() => core.setSetting("accent", a.value)}
          />
        ))}
        <label className="accent-swatch accent-custom" title="Custom colour">
          <input type="color" value={s.accent || "#4466ff"} onChange={(e) => core.setSetting("accent", e.target.value)} />
        </label>
      </div>

      <div className="pane-label" style={{ marginTop: 18 }}>background</div>
      <div className="bg-grid">
        <button className={cn("bg-btn", s.wallpaperType === "none" && "active")} onClick={() => core.setSetting("wallpaperType", "none")}>
          <span className="bg-swatch bg-swatch-none" />
          none
        </button>
        <button className={cn("bg-btn", s.wallpaperType === "gradient" && "active")} onClick={() => core.setSetting("wallpaperType", "gradient")}>
          <span className="bg-swatch bg-swatch-gradient" />
          glow
        </button>
        <label className={cn("bg-btn bg-upload", s.wallpaperType === "image" && "active")} title="upload an image">
          <span className="bg-swatch bg-swatch-image">
            <Icon name="attach-file" size={16} />
          </span>
          image
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const data = await compressWallpaper(file);
                localStorage.setItem(WALLPAPER_KEY, data);
                setHasImg(true);
                setWallpaperErr(false);
                core.setSetting("wallpaperType", "image");
                toast.success("wallpaper set");
              } catch {
                setWallpaperErr(true);
                toast.error("that image is too big. try a smaller one");
              }
            }}
          />
        </label>
      </div>
      {(hasImg || wallpaperErr) && (
        <button
          className="action-btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            try {
              localStorage.removeItem(WALLPAPER_KEY);
            } catch {
            }
            setHasImg(false);
            setWallpaperErr(false);
            if (s.wallpaperType === "image") core.setSetting("wallpaperType", "none");
            if (!wallpaperErr) toast.info("wallpaper gone");
          }}
        >
          <Icon name={wallpaperErr ? "badge-alert" : "delete"} size={13} />
          {wallpaperErr ? "couldn't use that image" : "remove"}
        </button>
      )}
    </>
  );
}

export function WidgetsSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">new tab</div>
      <ToggleRow name="clock" k="ntClock" s={s} icon="clock" />
      <ToggleRow name="quick links" k="widgetQuickLinks" s={s} />
      <div className="pane-label" style={{ marginTop: 8 }}>widgets</div>
      <ToggleRow name="date" k="widgetDate" s={s} icon="calendar-days" />
      <ToggleRow name="weather" k="widgetWeather" s={s} icon="cloud-sun" />
      <ToggleRow name="battery" k="widgetBattery" s={s} icon="battery-medium" />
      <ToggleRow name="to-do" k="widgetTodo" s={s} />
      <ToggleRow name="timer" k="widgetPomodoro" s={s} icon="hourglass" />
      <ToggleRow name="notes" k="widgetNotes" s={s} icon="square-pen" />
    </>
  );
}

export function LayoutSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const vertical = s.tabPosition === "left" || s.tabPosition === "right";
  return (
    <>
      <div className="pane-label">tabs</div>
      <div className="tab-pos-grid">
        {(["top", "bottom", "left", "right"] as TabPosition[]).map((pos) => (
          <button key={pos} className={cn("tab-pos-btn", s.tabPosition === pos && "active")} onClick={() => core.setSetting("tabPosition", pos)}>
            {TAB_POS_SVG[pos]}
            {pos}
          </button>
        ))}
      </div>
      {vertical && (
        <div style={{ marginTop: 14 }}>
          <label className="setting-row toggle-row">
            <div className="setting-info">
              <span className="setting-name">hide sidebar</span>
            </div>
            <Toggle checked={s.sidebarCollapsed} onChange={(v) => core.setSetting("sidebarCollapsed", v)} />
          </label>
        </div>
      )}
    </>
  );
}

export function SearchSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">search</div>
      <div className="setting-row">
        <span className="setting-name">engine</span>
        <select className="setting-select" value={s.searchEngine} onChange={(e) => core.setSetting("searchEngine", e.currentTarget.value)}>
          <option value="duckduckgo">DuckDuckGo</option>
          <option value="google">Google</option>
          <option value="bing">Bing</option>
          <option value="brave">Brave</option>
          <option value="startpage">Startpage</option>
        </select>
      </div>
    </>
  );
}

export function BookmarksSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const folders = Array.from(new Set(s.bookmarks.map((bookmark) => bookmark.folder).filter(Boolean) as string[]));

  const exportBookmarks = () => {
    const blob = new Blob([JSON.stringify({ version: 1, bookmarks: s.bookmarks }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bardo-bookmarks.json";
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`exported ${s.bookmarks.length}`);
  };

  return (
    <>
      <div className="pane-label">bar</div>
      <label className="setting-row toggle-row">
        <span className="setting-name">show bookmarks bar</span>
        <Toggle checked={s.bookmarksVisible} onChange={(v) => core.setSetting("bookmarksVisible", v)} />
      </label>
      <div className="bm-settings-actions">
        <label className="action-btn bm-import-btn">
          <Icon name="attach-file" size={13} />
          import
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              try {
                const count = core.importBookmarks(JSON.parse(await file.text()));
                toast.success(count ? `imported ${count}` : "nothing new");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "that file is junk.");
              }
            }}
          />
        </label>
        <button className="action-btn" onClick={exportBookmarks} disabled={s.bookmarks.length === 0}>
          <Icon name="copy" size={13} />
          export
        </button>
      </div>

      <div className="pane-label" style={{ marginTop: 16 }}>saved</div>
      {s.bookmarks.length === 0 ? (
        <div className="settings-empty"><Icon name="bookmark" size={18} /><span>none yet</span><small>save a page from the toolbar.</small></div>
      ) : (
        <div className="bm-settings-list">
          {s.bookmarks.map((bookmark, index) => {
            let favicon = "";
            try { favicon = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`; } catch {}
            return (
              <div className="bm-settings-row" key={bookmark.id}>
                <span className="bm-settings-favicon">{favicon ? <img src={favicon} alt="" /> : <Icon name="bookmark" size={13} />}</span>
                <div className="bm-settings-copy">
                  <input
                    className="setting-input"
                    value={bookmark.title}
                    aria-label={`Bookmark title for ${bookmark.url}`}
                    onChange={(event) => core.updateBookmark(bookmark.id, { title: event.currentTarget.value })}
                  />
                  <input
                    className="setting-input bm-folder-input"
                    list="bardo-bookmark-folders"
                    value={bookmark.folder || ""}
                    placeholder="no folder"
                    aria-label={`Folder for ${bookmark.title}`}
                    onChange={(event) => core.updateBookmark(bookmark.id, { folder: event.currentTarget.value })}
                  />
                </div>
                <div className="bm-row-actions">
                  <button className={cn("mini-action", bookmark.pinnedNewTab && "active")} title={bookmark.pinnedNewTab ? "Unpin from New Tab" : "Pin to New Tab"} onClick={() => core.updateBookmark(bookmark.id, { pinnedNewTab: !bookmark.pinnedNewTab })}>
                    <Icon name="home" size={12} />
                  </button>
                  <button className="mini-action" title="Move up" disabled={index === 0} onClick={() => core.moveBookmark(bookmark.id, -1)}>↑</button>
                  <button className="mini-action" title="Move down" disabled={index === s.bookmarks.length - 1} onClick={() => core.moveBookmark(bookmark.id, 1)}>↓</button>
                  <button className="mini-action" title="Remove bookmark" onClick={() => core.removeBookmark(bookmark.id)}><Icon name="delete" size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <datalist id="bardo-bookmark-folders">{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
      {folders.length > 0 && (
        <div className="bm-folder-actions">
          {folders.map((folder) => (
            <button key={folder} className="action-btn" onClick={() => {
              const count = core.openBookmarkFolder(folder);
              toast.success(`opened ${count} from ${folder}`);
            }}>
              <Icon name="layout-grid" size={13} /> open {folder}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function HistorySection({ onOpenHistory }: { onOpenHistory: () => void }) {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <div className="pane-label">history</div>
      <ToggleRow name="save history" k="historyEnabled" s={s} />
      <button className="action-btn" onClick={onOpenHistory}>
        open history
      </button>
    </>
  );
}

export function PrivacySection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const historyCount = useBardoSelector((snapshot) => snapshot.history.length);
  return (
    <>
      <ToggleRow name="save history" hint={s.sessionOnly ? "paused" : `${historyCount} saved`} k="historyEnabled" s={s} />
      <ToggleRow name="restore tabs" hint={s.sessionOnly ? "paused" : "open last session"} k="restoreTabs" s={s} />
      <ToggleRow name="session only" hint="forget after close" k="sessionOnly" s={s} />
      <div className="privacy-actions" style={{ marginTop: 16 }}>
        <ConfirmButton className="action-btn" label="clear history" confirmLabel="click again to clear" icon="delete" onConfirm={() => { core.clearBrowsingData(); toast.success("cleared"); }} />
        <ConfirmButton className="action-btn danger" label="reset everything" confirmLabel="click again to reset" icon="badge-alert" onConfirm={() => { toast.info("resetting…"); core.clearAllData(); }} />
      </div>
    </>
  );
}

export function CloakerSection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const abBlocked = useBardoSelector((snapshot) => snapshot.abBlocked);
  return (
    <>
      <div className="pane-label">tab looks like</div>
      <div className="cloak-grid">
        {CLOAKS.map(([id, label]) => (
          <button key={id} className={cn("cloak-btn", s.tabCloak === id && "active")} onClick={() => core.setSetting("tabCloak", id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="pane-label" style={{ marginTop: 16 }}>about:blank</div>
      <ToggleRow name="open on launch" k="aboutBlankMode" s={s} />
      <ToggleRow name="use tab name" k="aboutBlankRememberCloak" s={s} />
      <label className="setting-row privacy-field">
        <span className="setting-name">title</span>
        <input className="setting-input" value={s.aboutBlankTitle} placeholder="same as above" maxLength={100} onInput={(event) => core.setSetting("aboutBlankTitle", event.currentTarget.value)} />
      </label>
      <label className="setting-row privacy-field">
        <span className="setting-name">icon</span>
        <input className="setting-input" type="url" value={s.aboutBlankFavicon} placeholder="https://…" onInput={(event) => core.setSetting("aboutBlankFavicon", event.currentTarget.value)} />
      </label>
      <div className="privacy-actions">
        <button className="action-btn" onClick={() => core.launchAboutBlank("session")}><Icon name="layout-grid" size={13} />open session</button>
        <button className="action-btn" onClick={() => core.launchAboutBlank("current")}><Icon name="eye" size={13} />open this page</button>
      </div>
      {abBlocked && <p className="inline-notice warning"><Icon name="badge-alert" size={13} />popup blocked. allow popups and try again.</p>}
    </>
  );
}

export function SafetySection() {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  return (
    <>
      <label className="setting-row">
        <span className="setting-name">key</span>
        <div className="panic-key-controls">
          <button
            type="button"
            className="setting-input panic-key-capture"
            aria-label="set exit key"
            onKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const key = event.key;
              if (key.length <= 1 || ["Unidentified", "Process", "Dead"].includes(key)) {
                toast.info("use a special key, not a letter");
                return;
              }
              core.setSetting("panicKey", key);
              toast.success(`${key} is set`);
            }}
          >
            {s.panicKey || "press a key"}
          </button>
          {s.panicKey && <button type="button" className="mini-action panic-key-clear" onClick={() => core.setSetting("panicKey", "")}>clear</button>}
        </div>
      </label>
      <label className="setting-row" style={{ marginTop: 12 }}>
        <span className="setting-name">go to</span>
        <input
          type="url"
          className="setting-input"
          placeholder="https://classroom.google.com"
          value={s.panicUrl}
          onInput={(e) => core.setSetting("panicUrl", e.currentTarget.value)}
        />
      </label>
      <p className="pane-hint" style={{ marginTop: 12 }}>press it and you're out. history gets wiped.</p>
    </>
  );
}

export function DiagnosticsSection({ onOpenDiagnostics }: { onOpenDiagnostics: () => void }) {
  const d = useDiagnostics();
  const summary = d.overall === "ok" ? "all good" : d.overall === "warn" ? "a little off" : "needs a look";
  return (
    <>
      <p className="pane-hint">{summary}</p>
      <button className="action-btn" onClick={onOpenDiagnostics}>
        <Icon name="arrow-right" size={13} /> open diagnostics
      </button>
    </>
  );
}

export function AdvancedSection({ compact }: { compact?: boolean }) {
  const s = useBardoSelector((snapshot) => snapshot.settings);
  const engineSupport = useBardoSelector((snapshot) => snapshot.engineSupport);
  const capabilitiesReady = useBardoSelector((snapshot) => snapshot.capabilitiesReady);
  const deploymentMode = useBardoSelector((snapshot) => snapshot.deploymentMode);
  return (
    <>
      <div className="pane-label">engine</div>
      <p className="pane-hint">needs a reload</p>
      {capabilitiesReady && deploymentMode === "frontend-preview" && (
        <p className="inline-notice warning">
          preview only. browsing isn't on this host.
        </p>
      )}
      <div className="engine-grid">
        {ENGINES.map(({ id, name, hint }) => {
          const available = !capabilitiesReady || engineSupport[id];
          return (
            <button
              key={id}
              className={cn("engine-btn", (s.engine || "sherpa") === id && "active")}
              disabled={!available}
              title={available ? undefined : "not on this host"}
              onClick={() => core.setSetting("engine", id)}
            >
              <span className="engine-name">{name}</span>
              <span className="engine-hint">{available ? hint : "not on this host"}</span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="pane-hint" style={{ marginTop: 8 }}>
          sherpa is agpl.{" "}
          <a href="https://github.com/bitball41/sherpa" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            source
          </a>
        </p>
      )}
      <div className="pane-label" style={{ marginTop: 16 }}>devtools</div>
      <ToggleRow name="eruda" hint="inspect the page" k="erudaEnabled" s={s} />
      <div className="pane-label" style={{ marginTop: 8 }}>fix it</div>
      <ConfirmButton
        className="action-btn"
        label="force reload"
        confirmLabel="click again to reload"
        icon="refresh-ccw"
        onConfirm={() => {
          toast.info("reloading…");
          core.forceReload();
        }}
      />
      {!compact && (
        <>
          <ConfirmButton
            className="action-btn"
            label="reset settings"
            confirmLabel="click again to reset"
            icon="delete"
            onConfirm={() => {
              core.resetSettings();
              toast.success("back to defaults");
            }}
          />
          <p className="pane-hint" style={{ marginTop: 8 }}>
            bookmarks stay.
          </p>
          <div className="pane-label" style={{ marginTop: 18 }}>keys</div>
          <div className="shortcut-list">
            <div className="shortcut-row"><span>tab 1-9</span><div className="shortcut-keys"><kbd>Alt</kbd> + <kbd>1</kbd>-<kbd>9</kbd></div></div>
            <div className="shortcut-row"><span>back / forward</span><div className="shortcut-keys"><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd></div></div>
            <div className="shortcut-row"><span>new tab</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>T</kbd></div></div>
            <div className="shortcut-row"><span>history</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>H</kbd></div></div>
            <div className="shortcut-row"><span>close tab</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>W</kbd></div></div>
            <div className="shortcut-row"><span>address bar</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>L</kbd></div></div>
            <div className="shortcut-row"><span>reload</span><div className="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>R</kbd></div></div>
          </div>
          <p className="pane-hint" style={{ marginTop: 8 }}>
            ctrl shortcuts only work in about:blank.
          </p>
        </>
      )}
    </>
  );
}

export interface SectionBodyProps {
  pane: PaneId;
  compact?: boolean;
  onOpenHistory: () => void;
  onOpenDiagnostics?: () => void;
  themesProps?: ThemesSectionProps;
}

/**
 * Shared pane content used by both the Settings modal and pinned toolbar
 * popovers, so there is exactly one implementation of every control.
 */
export function SectionBody({ pane, compact, onOpenHistory, onOpenDiagnostics, themesProps }: SectionBodyProps) {
  switch (pane) {
    case "themes":
      return <ThemesSection {...themesProps} />;
    case "appearance":
      return <AppearanceSection />;
    case "widgets":
      return <WidgetsSection />;
    case "layout":
      return <LayoutSection />;
    case "search":
      return <SearchSection />;
    case "bookmarks":
      return <BookmarksSection />;
    case "history":
      return <HistorySection onOpenHistory={onOpenHistory} />;
    case "privacy":
      return <PrivacySection />;
    case "cloaker":
      return <CloakerSection />;
    case "safety":
      return <SafetySection />;
    case "diagnostics":
      return <DiagnosticsSection onOpenDiagnostics={onOpenDiagnostics ?? (() => {})} />;
    case "advanced":
      return <AdvancedSection compact={compact} />;
    default:
      return null;
  }
}
