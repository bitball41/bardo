import { lazy, Suspense, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Chrome } from "@/components/Chrome";
import { TabBar } from "@/components/TabBar";
import { BookmarksBar } from "@/components/BookmarksBar";
import { NewTab } from "@/components/NewTab";
import { FrameHost } from "@/components/FrameHost";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TabSwitcher } from "@/components/TabSwitcher";
import { Toaster } from "@/components/ui/Toaster";
import { BARDO_FAVICON, TAB_CLOAKS, WALLPAPER_KEY } from "@/lib/constants";
import { applyThemeToDocument } from "@/lib/customThemes";
import { core, shallowEqual, useBardoSelector } from "@/lib/useCore";

const HistoryPage = lazy(() =>
  import("@/components/HistoryPage").then((module) => ({ default: module.HistoryPage })),
);
const Settings = lazy(() =>
  import("@/components/settings/Settings").then((module) => ({ default: module.Settings })),
);

export default function App() {
  const { settings: s, abLaunched, customThemes } = useBardoSelector(
    (snapshot) => ({ settings: snapshot.settings, abLaunched: snapshot.abLaunched, customThemes: snapshot.customThemes }),
    shallowEqual,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(false);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);

  useEffect(() => {
    core.boot();
  }, []);

  useEffect(() => {
    applyThemeToDocument(s, customThemes);
  }, [s.theme, s.accent, s.moreContrast, customThemes]);

  useEffect(() => {
    const cloak = TAB_CLOAKS[s.tabCloak] || TAB_CLOAKS.none;
    document.title = cloak.title;
    const fav = document.getElementById("favicon") as HTMLLinkElement | null;
    if (fav) fav.href = cloak.favicon || BARDO_FAVICON;
  }, [s.tabCloak]);

  useEffect(() => {
    const pos = s.tabPosition || "top";
    if (pos === "top") document.documentElement.removeAttribute("data-tabs");
    else document.documentElement.setAttribute("data-tabs", pos);
  }, [s.tabPosition]);

  useEffect(() => {
    document.documentElement.style.setProperty("--bookmarks-h", s.bookmarksVisible ? "36px" : "0px");
  }, [s.bookmarksVisible]);

  useEffect(() => {
    const vertical = s.tabPosition === "left" || s.tabPosition === "right";
    if (vertical && s.sidebarCollapsed) document.documentElement.setAttribute("data-sidebar", "collapsed");
    else document.documentElement.removeAttribute("data-sidebar");
  }, [s.sidebarCollapsed, s.tabPosition]);

  useEffect(() => {
    if (fullscreen) document.documentElement.setAttribute("data-fullscreen", "");
    else {
      document.documentElement.removeAttribute("data-fullscreen");
      setFullscreenControlsVisible(false);
    }
  }, [fullscreen]);

  useEffect(() => {
    const root = document.documentElement;
    if (s.wallpaperType === "gradient") {
      root.style.setProperty(
        "--nt-bg",
        "radial-gradient(circle at 25% 12%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 55%)," +
          "radial-gradient(circle at 82% 88%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 55%)," +
          "var(--bg)",
      );
    } else if (s.wallpaperType === "image") {
      let img: string | null = null;
      try {
        img = localStorage.getItem(WALLPAPER_KEY);
      } catch {
      }
      root.style.setProperty(
        "--nt-bg",
        img
          ? "linear-gradient(color-mix(in srgb, var(--bg) 45%, transparent), color-mix(in srgb, var(--bg) 62%, transparent))," +
              `url("${img}") center/cover no-repeat`
          : "var(--bg)",
      );
    } else {
      root.style.removeProperty("--nt-bg");
    }
  }, [s.wallpaperType]);

  useEffect(() => {
    if (settingsOpen || historyOpen) {
      const modal = document.querySelector<HTMLElement>('[role="dialog"]');
      const focusable = modal?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
  }, [settingsOpen, historyOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;

      if (s.panicKey && e.key === s.panicKey && !typing) {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        core.panic();
        return;
      }

      if (e.key === "Escape" && historyOpen) {
        e.preventDefault();
        setHistoryOpen(false);
        return;
      }

      if (e.key === "Escape" && settingsOpen) {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }

      if (e.key === "Escape" && fullscreen) {
        e.preventDefault();
        setFullscreen(false);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          core.back();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          core.forward();
          return;
        }
        if (/^[1-9]$/.test(e.key)) {
          const tab = core.getSnapshot().tabs[+e.key - 1];
          if (tab) {
            e.preventDefault();
            core.activateTab(tab.id);
          }
          return;
        }
      }

      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setTabSwitcherOpen(true);
        return;
      }
      switch (e.key.toLowerCase()) {
        case "l":
          e.preventDefault();
          {
            const urlBar = document.getElementById("url-bar");
            const trigger = urlBar?.parentElement?.querySelector<HTMLButtonElement>("button");
            if (trigger) trigger.click();
            else urlBar?.focus();
          }
          break;
        case "t":
          e.preventDefault();
          core.openTab();
          break;
        case "h":
          e.preventDefault();
          setHistoryOpen(true);
          break;
        case "w":
          {
            const activeId = core.getSnapshot().activeId;
            if (activeId === null) break;
            e.preventDefault();
            core.closeTab(activeId);
          }
          break;
        case "r":
          if (!typing) {
            e.preventDefault();
            core.reload();
          }
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s.panicKey, settingsOpen, historyOpen, fullscreen, tabSwitcherOpen]);

  if (abLaunched) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#000", color: "#fff", fontFamily: "system-ui, sans-serif", gap: 10 }}>
        <p style={{ fontSize: 18, opacity: 0.6 }}>Stealth tab opened.</p>
        <p style={{ fontSize: 13, color: "#555" }}>You can close this tab.</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div style={{ position: "fixed", inset: 0 }}>
        <TabBar />
        <Chrome
          onSettings={() => setSettingsOpen(true)}
          onHistory={() => setHistoryOpen(true)}
          onTabSwitcher={() => setTabSwitcherOpen(true)}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((f) => !f)}
        />
        <BookmarksBar />
        <NewTab />
        <FrameHost />

        {fullscreen && (
          <div
            className={`fs-reveal-zone${fullscreenControlsVisible ? " visible" : ""}`}
            onPointerEnter={() => setFullscreenControlsVisible(true)}
            onPointerLeave={() => setFullscreenControlsVisible(false)}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setFullscreenControlsVisible(true);
            }}
          >
            <button className="fs-hover-bar" onClick={() => setFullscreen(false)}>
              <Icon name="maximize-2" size={14} />
              Exit fullscreen
            </button>
          </div>
        )}

        {historyOpen && (
          <Suspense fallback={null}>
            <ErrorBoundary>
              <HistoryPage open onClose={() => setHistoryOpen(false)} onOpenUrl={(url) => core.openTab(url)} />
            </ErrorBoundary>
          </Suspense>
        )}
        {settingsOpen && (
          <Suspense fallback={null}>
            <ErrorBoundary>
              <Settings open onClose={() => setSettingsOpen(false)} onOpenHistory={() => setHistoryOpen(true)} />
            </ErrorBoundary>
          </Suspense>
        )}

        <TabSwitcher open={tabSwitcherOpen} onClose={() => setTabSwitcherOpen(false)} />

        <Toaster />
      </div>
    </ErrorBoundary>
  );
}
