import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { GooeyInput } from "@/components/ui/gooey-input";
import { WaffleMenu } from "@/components/WaffleMenu";
import { SectionBody } from "@/components/settings/sections";
import { PANE_BY_ID, type PaneId } from "@/lib/panes";
import { paneOf, type ToolbarEntry } from "@/lib/toolbar";
import { toast } from "@/lib/toast";
import { core, shallowEqual, useBardoSelector } from "@/lib/useCore";
import { cn } from "@/lib/utils";

interface ChromeProps {
  onSettings: () => void;
  onHistory: () => void;
  onTabSwitcher: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

function PaneButton({ pane, onOpenHistory }: { pane: PaneId; onOpenHistory: () => void }) {
  const meta = PANE_BY_ID[pane];
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.right - width), Math.max(8, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 6, left, width });
    };
    place();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !btnRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Callback ref so focus moves in exactly when the popover node attaches.
  const focusedOnOpen = useRef(false);
  const attachPop = (node: HTMLDivElement | null) => {
    popRef.current = node;
    if (!node) {
      focusedOnOpen.current = false;
      return;
    }
    if (focusedOnOpen.current) return;
    focusedOnOpen.current = true;
    node.querySelector<HTMLElement>("button, [href], input, select, textarea")?.focus();
  };

  return (
    <>
      <button
        ref={btnRef}
        className={cn("nav-btn", open && "pin-btn-open")}
        title={meta.label}
        aria-label={meta.label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={meta.icon} size={15} />
      </button>
      {open && pos && (
        <div
          ref={attachPop}
          className="pin-popover"
          role="dialog"
          aria-label={`${meta.label} settings`}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="pin-pop-header">
            <Icon name={meta.icon} size={14} anim="none" />
            <span>{meta.label}</span>
          </div>
          <div className="pin-pop-body">
            <SectionBody
              pane={pane}
              compact
              onOpenHistory={() => {
                setOpen(false);
                onOpenHistory();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export function Chrome({ onSettings, onHistory, onTabSwitcher, fullscreen, onToggleFullscreen }: ChromeProps) {
  const { activeUrl, canBack, canFwd, settings, progress, toolbar } = useBardoSelector(
    (snapshot) => ({
      activeUrl: snapshot.activeUrl,
      canBack: snapshot.canBack,
      canFwd: snapshot.canFwd,
      settings: snapshot.settings,
      progress: snapshot.progress,
      toolbar: snapshot.toolbar,
    }),
    shallowEqual,
  );
  const [value, setValue] = useState(activeUrl);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    setValue(activeUrl);
  }, [activeUrl]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const vertical = settings.tabPosition === "left" || settings.tabPosition === "right";
  const collapsed = settings.sidebarCollapsed;

  const renderEntry = (entry: ToolbarEntry) => {
    const pane = paneOf(entry.id);
    if (pane) return <PaneButton key={entry.key} pane={pane} onOpenHistory={onHistory} />;

    switch (entry.id) {
      case "separator":
        return <span key={entry.key} className="tb-sep" aria-hidden />;
      case "spacer":
        return <span key={entry.key} className="tb-spacer" aria-hidden />;
      case "sidebar-toggle":
        if (!vertical) return null;
        return (
          <button
            key={entry.key}
            className="nav-btn"
            title={collapsed ? "Show tabs" : "Hide tabs"}
            onClick={() => core.setSetting("sidebarCollapsed", !collapsed)}
          >
            <Icon
              name={
                collapsed
                  ? settings.tabPosition === "right"
                    ? "panel-right-open"
                    : "panel-left-open"
                  : "panel-left-close"
              }
              size={15}
            />
          </button>
        );
      case "back":
        return (
          <button key={entry.key} className="nav-btn" id="btn-back" title="Back" disabled={!canBack} onClick={() => core.back()}>
            <Icon name="arrow-left" size={15} />
          </button>
        );
      case "forward":
        return (
          <button key={entry.key} className="nav-btn" id="btn-fwd" title="Forward" disabled={!canFwd} onClick={() => core.forward()}>
            <Icon name="arrow-right" size={15} />
          </button>
        );
      case "reload":
        return (
          <button key={entry.key} className="nav-btn" id="btn-reload" title="Reload" onClick={() => core.reload()}>
            <Icon name="refresh-ccw" size={15} />
          </button>
        );
      case "home":
        return (
          <button key={entry.key} className="nav-btn" id="btn-home" title="Home" onClick={() => core.goHome()}>
            <Icon name="home" size={15} />
          </button>
        );
      case "address":
        return (
          <form
            key={entry.key}
            id="chrome-form"
            autoComplete="off"
            spellCheck={false}
            onSubmit={(e) => {
              e.preventDefault();
              core.submitUrl(e.currentTarget.querySelector<HTMLInputElement>("#url-bar")?.value ?? value);
            }}
          >
            <GooeyInput
              inputId="url-bar"
              placeholder="Search or enter address"
              value={value}
              onValueChange={setValue}
              collapsedWidth="100%"
              expandedWidth="calc(100% - 32px)"
              expandedOffset={32}
              gooeyBlur={5}
              collapseOnBlur
              clearOnCollapse={false}
              selectOnFocus
              className="gooey-address-root"
              classNames={{
                filterWrap: "gooey-address-filter",
                buttonRow: "gooey-address-row",
                trigger: "gooey-address-trigger",
                input: "gooey-address-input",
                bubble: "gooey-address-bubble",
                bubbleSurface: "gooey-address-bubble-surface",
              }}
            />
          </form>
        );
      case "copy-link":
        return (
          <button
            key={entry.key}
            className="nav-btn"
            id="btn-copy-link"
            title={copyState === "copied" ? "Link copied" : copyState === "error" ? "Could not copy link" : "Copy link"}
            disabled={!activeUrl}
            onClick={async () => {
              try {
                await copyText(activeUrl);
                setCopyState("copied");
              } catch {
                setCopyState("error");
              }
            }}
          >
            <Icon name={copyState === "copied" ? "check" : copyState === "error" ? "badge-alert" : "copy"} size={15} />
          </button>
        );
      case "fullscreen":
        return (
          <button
            key={entry.key}
            className="nav-btn"
            id="btn-fullscreen"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen page"}
            onClick={onToggleFullscreen}
          >
            <Icon name="maximize-2" size={15} />
          </button>
        );
      case "aboutblank":
        return (
          <button key={entry.key} className="nav-btn" title="Launch session in about:blank" onClick={() => core.launchAboutBlank("session")}>
            <Icon name="eye" size={15} />
          </button>
        );
      case "history":
        return (
          <button key={entry.key} className="nav-btn" id="btn-history" title="History" onClick={onHistory}>
            <Icon name="history" size={15} />
          </button>
        );
      case "bookmarks":
        return (
          <button
            key={entry.key}
            className="nav-btn"
            id="btn-bookmark"
            title="Bookmark this page"
            onClick={() => {
              const result = core.addBookmark();
              if (result.status === "added") toast.success(`Bookmarked “${result.title}”`);
              else if (result.status === "duplicate") toast.info("Already bookmarked");
              else toast.error("Open a page first to bookmark it");
            }}
          >
            <Icon name="bookmark" size={15} />
          </button>
        );
      case "shortcuts":
        return <WaffleMenu key={entry.key} />;
      case "settings":
        return (
          <button key={entry.key} className="nav-btn" id="btn-menu" title="Settings" onClick={onSettings}>
            <Icon name="settings" size={15} />
          </button>
        );
      case "new-tab":
        return (
          <button key={entry.key} className="nav-btn" title="New tab" onClick={() => core.openTab()}>
            <Icon name="plus" size={15} />
          </button>
        );
      case "tab-switcher":
        return (
          <button key={entry.key} className="nav-btn" title="Tab switcher" onClick={onTabSwitcher}>
            <Icon name="layout-grid" size={15} />
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div id="chrome">
      {toolbar.map(renderEntry)}

      {settings.erudaEnabled && (
        <button className="nav-btn" id="btn-devtools" title="Developer tools" onClick={openEruda}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,5 1,8 4,11" />
            <polyline points="12,5 15,8 12,11" />
            <line x1="9.5" y1="2.5" x2="6.5" y2="13.5" />
          </svg>
        </button>
      )}

      <div id="progress-bar" className={progress === "idle" ? "" : progress} style={{ width: progress === "active" ? "75%" : progress === "done" ? "100%" : "0%" }} />
    </div>
  );
}

async function copyText(value: string) {
  if (!value) throw new Error("No active URL");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Copy unavailable");
}

let erudaOpen = false;
async function openEruda() {
  try {
    const eruda = (await import("eruda")).default;
    if (!window.eruda) {
      eruda.init();
      window.eruda = eruda;
    }

    if (erudaOpen) eruda.hide();
    else eruda.show();
    erudaOpen = !erudaOpen;
  } catch {
    toast.error("Developer tools failed to load.");
  }
}
