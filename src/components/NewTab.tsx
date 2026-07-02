import { lazy, Suspense, useEffect, useId, useState } from "react";
import { Icon } from "@/components/icons";
import { GooeyInput } from "@/components/ui/gooey-input";
import { gFav } from "@/lib/constants";
import { toast } from "@/lib/toast";
import { core, shallowEqual, useBardoSelector } from "@/lib/useCore";
import type { Shortcut } from "@/lib/types";

const lazyWidget = <T extends keyof typeof import("@/components/widgets")>(name: T) =>
  lazy(() => import("@/components/widgets").then((module) => ({ default: module[name] })));

const BatteryWidget = lazyWidget("BatteryWidget");
const DateWidget = lazyWidget("DateWidget");
const NotesWidget = lazyWidget("NotesWidget");
const PomodoroWidget = lazyWidget("PomodoroWidget");
const TodoWidget = lazyWidget("TodoWidget");
const WeatherWidget = lazyWidget("WeatherWidget");

function greeting(h: number) {
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div id="nt-clock" className="visible">
      <span className="nt-time-row">
        <span id="nt-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </span>
      <span id="nt-greeting">{greeting(now.getHours())}</span>
    </div>
  );
}

function QuickLinkIcon({ sc }: { sc: Shortcut }) {
  const [failed, setFailed] = useState(false);
  let src = sc.icon && !sc.icon.startsWith("preset:") ? sc.icon : "";
  if (!src) {
    try {
      src = gFav(new URL(sc.url).hostname);
    } catch {
    }
  }
  if (!src || failed) return null;
  return <img src={src} alt="" onError={() => setFailed(true)} />;
}

function ShortcutForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Shortcut | null;
  onSave: (sc: Shortcut) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [icon, setIcon] = useState(initial?.icon && !initial.icon.startsWith("preset:") ? initial.icon : "");
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="ql-form-overlay" onClick={onCancel}>
      <form
        className="ql-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return;
          onSave({ label, url, icon: icon.trim() || undefined });
        }}
      >
        <h3 id={titleId}>{initial ? "Edit shortcut" : "Add shortcut"}</h3>
        <label>
          <span>URL</span>
          <input autoFocus value={url} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="example.com" />
        </label>
        <label>
          <span>Name</span>
          <input value={label} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Optional — defaults to site" />
        </label>
        <label>
          <span>Icon URL</span>
          <input value={icon} onInput={(e) => setIcon(e.currentTarget.value)} placeholder="Optional — defaults to favicon" />
        </label>
        <div className="ql-form-actions">
          <button type="button" className="ql-form-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="ql-form-btn ql-form-save">
            <Icon name="check" size={14} /> Save
          </button>
        </div>
      </form>
    </div>
  );
}

export function NewTab() {
  const { settings, status, statusWarn, showNewTab, shortcuts, savedTabGroups, abBlocked } = useBardoSelector(
    (snapshot) => ({
      settings: snapshot.settings,
      status: snapshot.status,
      statusWarn: snapshot.statusWarn,
      showNewTab: snapshot.showNewTab,
      shortcuts: snapshot.shortcuts,
      savedTabGroups: snapshot.savedTabGroups,
      abBlocked: snapshot.abBlocked,
    }),
    shallowEqual,
  );
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ index: number | null } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const statusLoading = !statusWarn && /loading|setting up|starting|registering|refreshing|clearing/i.test(status);
  const pinnedBookmarks = settings.bookmarks.filter((bookmark) => bookmark.pinnedNewTab);

  return (
    <div id="new-tab" hidden={!showNewTab}>
      {settings.ntClock && <Clock />}

      <div id="brand">
        <svg id="logo" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16 68 L16 38 Q16 12 40 12 Q64 12 64 38 L64 68"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <line x1="8" y1="68" x2="72" y2="68" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <h1 id="wordmark">Bardo</h1>
        <span id="byline">By Liminal</span>
      </div>

      <form
        id="search-form"
        autoComplete="off"
        spellCheck={false}
        onSubmit={(e) => {
          e.preventDefault();
          core.submitUrl(e.currentTarget.querySelector<HTMLInputElement>("#search-input")?.value ?? search);
          setSearch("");
        }}
      >
        <GooeyInput
          inputId="search-input"
          placeholder="Search or enter URL…"
          value={search}
          onValueChange={setSearch}
          collapsedWidth="100%"
          expandedWidth="calc(100% - 48px)"
          expandedOffset={48}
          gooeyBlur={6}
          collapseOnBlur
          clearOnCollapse={false}
          selectOnFocus
          className="gooey-newtab-root"
          classNames={{
            filterWrap: "gooey-newtab-filter",
            buttonRow: "gooey-newtab-row",
            trigger: "gooey-newtab-trigger",
            input: "gooey-newtab-input",
            bubble: "gooey-newtab-bubble",
            bubbleSurface: "gooey-newtab-bubble-surface",
          }}
        />
      </form>

      <p id="status" aria-live="polite" style={statusWarn ? { color: "#ff5555" } : undefined}>
        {statusWarn ? (
          <Icon name="badge-alert" size={14} />
        ) : statusLoading ? (
          <Icon name="loader-circle" size={14} anim="loader" />
        ) : null}
        {status}
      </p>

      {settings.widgetQuickLinks && (
        <>
          <div id="nt-quicklinks" className={editing ? "editing" : undefined}>
            {shortcuts.map((sc, i) => (
              <div
                key={i}
                className={`ql-item${editing ? " ql-editing" : ""}${dragIdx === i ? " ql-dragging" : ""}`}
                title={sc.url}
                role="button"
                tabIndex={0}
                draggable={editing}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (editing) setForm({ index: i });
                    else core.navigate(sc.url);
                  }
                }}
                onClick={() => {
                  if (editing) setForm({ index: i });
                  else core.navigate(sc.url);
                }}
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => {
                  if (dragIdx === null || dragIdx === i) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx !== null && dragIdx !== i) core.reorderShortcuts(dragIdx, i);
                  setDragIdx(null);
                }}
                onDragEnd={() => setDragIdx(null)}
              >
                {editing && <Icon name="grip" size={13} className="ql-grip" />}
                <QuickLinkIcon sc={sc} />
                <span>{sc.label}</span>
                {editing && (
                  <span
                    className="ql-remove"
                    role="button"
                    aria-label="Remove shortcut"
                    onClick={(e) => {
                      e.stopPropagation();
                      core.removeShortcut(i);
                    }}
                  >
                    <Icon name="delete" size={13} />
                  </span>
                )}
              </div>
            ))}
            {editing && (
              <button className="ql-item ql-add" onClick={() => setForm({ index: null })}>
                <Icon name="plus" size={14} />
                <span>Add</span>
              </button>
            )}
          </div>
          {(shortcuts.length > 0 || editing) && (
            <button
              className="ql-edit-toggle"
              onClick={() => {
                setEditing((v) => !v);
                setForm(null);
                setDragIdx(null);
              }}
            >
              <Icon name={editing ? "check" : "square-pen"} size={13} />
              {editing ? "Done" : "Edit shortcuts"}
            </button>
          )}
        </>
      )}

      {form && (
        <ShortcutForm
          initial={form.index !== null ? shortcuts[form.index] ?? null : null}
          onCancel={() => setForm(null)}
          onSave={(sc) => {
            if (form.index !== null) core.updateShortcut(form.index, sc);
            else core.addShortcut(sc);
            setForm(null);
          }}
        />
      )}

      {(pinnedBookmarks.length > 0 || savedTabGroups.length > 0) && (
        <div className="nt-saved-shelf">
          {pinnedBookmarks.length > 0 && (
            <section className="nt-saved-section" aria-label="Pinned bookmarks">
              <div className="nt-saved-label"><Icon name="bookmark" size={12} />Pinned</div>
              <div className="nt-saved-row">
                {pinnedBookmarks.slice(0, 8).map((bookmark) => {
                  let favicon = "";
                  try { favicon = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`; } catch {}
                  return <button key={bookmark.id} className="nt-saved-chip" title={bookmark.url} onClick={() => core.navigate(bookmark.url)}>{favicon ? <img src={favicon} alt="" /> : <Icon name="bookmark" size={12} />}<span>{bookmark.title}</span></button>;
                })}
              </div>
            </section>
          )}
          {savedTabGroups.length > 0 && (
            <section className="nt-saved-section" aria-label="Saved tab groups">
              <div className="nt-saved-label"><Icon name="layout-grid" size={12} />Saved groups</div>
              <div className="nt-saved-row">
                {savedTabGroups.map((group) => (
                  <div className="nt-saved-group" key={group.id}>
                    <button className="nt-saved-chip" onClick={() => { core.reopenSavedTabGroup(group.id); toast.success(`Reopened “${group.name}”`); }}>
                      <Icon name="layout-grid" size={12} /><span>{group.name}</span><small>{group.tabs.length}</small>
                    </button>
                    <button className="nt-saved-remove" title={`Delete saved group ${group.name}`} onClick={() => core.deleteSavedTabGroup(group.id)}><Icon name="delete" size={10} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Suspense fallback={null}>
        <div id="nt-widgets-left" className="nt-corner">
          {settings.widgetDate && <DateWidget />}
          {settings.widgetWeather && <WeatherWidget />}
          {settings.widgetBattery && <BatteryWidget />}
          {settings.widgetPomodoro && <PomodoroWidget />}
        </div>
        <div id="nt-widgets-right" className="nt-corner">
          {settings.widgetTodo && <TodoWidget />}
          {settings.widgetNotes && <NotesWidget />}
        </div>
      </Suspense>

      {abBlocked && (
        <button className="stealth-launch-btn" style={{ display: "flex" }} onClick={() => core.launchAboutBlank("session")}>
          <Icon name="eye" size={15} />
          Open in stealth tab
        </button>
      )}
    </div>
  );
}
