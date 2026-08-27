import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { core, useBardoSelector } from "@/lib/useCore";
import type { TabView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { pageLabel } from "../../shared/url-codec";

export function TabSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tabs = useBardoSelector((s) => s.tabs);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = tabs.filter(
    (t) =>
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.url.toLowerCase().includes(query.toLowerCase()),
  );
  const activeDescendant = filtered[selected]
    ? `tab-switcher-item-${filtered[selected].id}`
    : undefined;

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const tab = filtered[selected];
        if (tab) {
          core.activateTab(tab.id);
          onClose();
        }
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, filtered, selected, onClose]);

  if (!open) return null;

  return (
    <div
      className="tab-switcher-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tab-switcher" role="dialog" aria-modal="true" aria-label="Tab switcher">
        <input
          ref={inputRef}
          className="tab-switcher-input"
          placeholder="Search tabs…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          aria-autocomplete="list"
          aria-controls="tab-switcher-list"
          aria-activedescendant={activeDescendant}
        />
        <div id="tab-switcher-list" className="tab-switcher-list" role="listbox">
          {filtered.length === 0 && (
            <div className="tab-switcher-empty">No matching tabs</div>
          )}
          {filtered.map((tab, i) => (
            <TabSwitcherItem
              key={tab.id}
              tab={tab}
              selected={i === selected}
              onClick={() => {
                core.activateTab(tab.id);
                onClose();
              }}
              onMouseEnter={() => setSelected(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TabSwitcherItem({
  tab,
  selected,
  onClick,
  onMouseEnter,
}: {
  tab: TabView;
  selected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      id={`tab-switcher-item-${tab.id}`}
      className={cn("tab-switcher-item", selected && "selected")}
      role="option"
      aria-selected={selected}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="tab-switcher-fav">
        {tab.favicon && !failed ? (
          <img src={tab.favicon} alt="" onError={() => setFailed(true)} />
        ) : (
          <Icon name="layout-panel-top" size={14} />
        )}
      </span>
      <span className="tab-switcher-title">{tab.title}</span>
      <span className="tab-switcher-url">{pageLabel(tab.url)}</span>
      {tab.pinned && <Icon name="bookmark" size={12} className="tab-switcher-pin" />}
    </div>
  );
}
