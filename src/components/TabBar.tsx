import { Fragment, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { core, useBardoSelector } from "@/lib/useCore";
import type { TabView } from "@/lib/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const PageGlyph = () => (
  <svg
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="1" width="10" height="12" rx="1.5" />
    <line x1="4.5" y1="4.5" x2="9.5" y2="4.5" />
    <line x1="4.5" y1="7" x2="9.5" y2="7" />
    <line x1="4.5" y1="9.5" x2="7.5" y2="9.5" />
  </svg>
);

const GROUP_COLORS = ["#7c6cff", "#4da3ff", "#27c9a5", "#79c95a", "#f0b849", "#ff7b54", "#e85d8f", "#b777f2"];

function TabFavicon({ tab }: { tab: TabView }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="tab-favicon">
      {tab.favicon && !failed ? (
        <img src={tab.favicon} alt="" onError={() => setFailed(true)} />
      ) : (
        <PageGlyph />
      )}
    </div>
  );
}

export function TabBar() {
  const tabs = useBardoSelector(
    (snapshot) => snapshot.tabs,
    (previous, next) =>
      previous.length === next.length &&
      previous.every((tab, index) => {
        const candidate = next[index];
        return (
          candidate !== undefined &&
          tab.id === candidate.id &&
          tab.title === candidate.title &&
          tab.url === candidate.url &&
          tab.favicon === candidate.favicon &&
          tab.loading === candidate.loading &&
          tab.active === candidate.active &&
          tab.pinned === candidate.pinned &&
          tab.groupId === candidate.groupId
        );
      }),
  );
  const tabGroups = useBardoSelector((snapshot) => snapshot.tabGroups);
  const savedTabGroups = useBardoSelector((snapshot) => snapshot.savedTabGroups);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [overGroupId, setOverGroupId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [createForTab, setCreateForTab] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const groupById = new Map(tabGroups.map((group) => [group.id, group]));

  useEffect(() => {
    if (!ctxMenu && !groupsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".tab-ctx-menu")) setCtxMenu(null);
      if (!(event.target as HTMLElement).closest(".tab-groups-wrap")) setGroupsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCtxMenu(null);
      if (event.key === "Escape") setGroupsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ctxMenu, groupsOpen]);

  const tabIdAtPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".tab");
    return el?.dataset.tabId ? Number(el.dataset.tabId) : null;
  };

  const groupIdAtPoint = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>(".tab-group-header")?.dataset.groupId || null;

  const beginCreateGroup = (tabId: number) => {
    setCreateForTab(tabId);
    setNewGroupName("");
    setNewGroupColor(GROUP_COLORS[tabGroups.length % GROUP_COLORS.length]);
    setEditingGroupId(null);
    setGroupsOpen(true);
    setCtxMenu(null);
  };

  const submitGroup = (event: FormEvent) => {
    event.preventDefault();
    if (createForTab === null || !newGroupName.trim()) return;
    if (core.createTabGroup(createForTab, newGroupName, newGroupColor)) {
      toast.success(`Created “${newGroupName.trim()}”`);
      setCreateForTab(null);
      setNewGroupName("");
    }
  };

  const endDrag = () => {
    drag.current = null;
    setDragId(null);
    setOverId(null);
    setOverGroupId(null);
    document.body.classList.remove("tab-dragging");
  };

  return (
    <div id="tab-bar">
      <div id="tab-bar-tabs" role="tablist" aria-label="Open tabs">
        {tabs.map((tab, index) => {
          const group = tab.groupId ? groupById.get(tab.groupId) : null;
          const firstInGroup = !!group && !tabs.slice(0, index).some((candidate) => candidate.groupId === group.id);
          const header = firstInGroup ? (
            <div key={`group-${group.id}`} className={cn("tab-group-header", overGroupId === group.id && "drag-target")} data-group-id={group.id} style={{ "--group-color": group.color } as CSSProperties}>
              <button className="tab-group-toggle" title={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`} onClick={() => core.toggleTabGroup(group.id)}>
                <i />
                <strong>{group.name}</strong>
                <small>{tabs.filter((candidate) => candidate.groupId === group.id).length}</small>
              </button>
              <button className="tab-group-action" title={`Manage ${group.name}`} onClick={() => { setGroupsOpen(true); setEditingGroupId(group.id); setEditingName(group.name); setCreateForTab(null); }}><Icon name="settings" size={11} /></button>
            </div>
          ) : null;
          if (group?.collapsed) return header;
          return (
          <Fragment key={tab.id}>
          {header}
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={cn("tab", group && "grouped", tab.active && "active", overId === tab.id && "drag-over", dragId === tab.id && "dragging", tab.pinned && "pinned")}
            style={group ? { "--group-color": group.color } as CSSProperties : undefined}
            role="tab"
            tabIndex={tab.active ? 0 : -1}
            aria-selected={tab.active}
            aria-label={tab.title}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({
                id: tab.id,
                x: Math.min(e.clientX, window.innerWidth - 152),
                y: Math.min(e.clientY, window.innerHeight - 112),
              });
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if ((e.target as HTMLElement).closest(".tab-close")) return;
              drag.current = { id: tab.id, x: e.clientX, y: e.clientY, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (!d.moved) {
                if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
                d.moved = true;
                setDragId(d.id);
                document.body.classList.add("tab-dragging");
              }
              setOverGroupId(groupIdAtPoint(e.clientX, e.clientY));
              const over = tabIdAtPoint(e.clientX, e.clientY);
              setOverId(over !== null && over !== d.id ? over : null);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              if (!d) return;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              if (d.moved) {
                const targetGroup = groupIdAtPoint(e.clientX, e.clientY);
                const target = tabIdAtPoint(e.clientX, e.clientY);
                if (targetGroup) core.addTabToGroup(d.id, targetGroup);
                else if (target !== null && target !== d.id) core.reorderTab(d.id, target);
              } else {
                core.activateTab(d.id);
              }
              endDrag();
            }}
            onPointerCancel={endDrag}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                core.closeTab(tab.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                core.activateTab(tab.id);
              }
            }}
          >
            <TabFavicon tab={tab} />
            <span className={cn("tab-title", tab.pinned && "pinned")}>{tab.title}</span>
            <button
              className="tab-close"
              title="Close tab"
              aria-label={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                core.closeTab(tab.id);
              }}
            >
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </div>
          </Fragment>
          );
        })}
      </div>
      <button id="btn-new-tab" title="New tab" onClick={() => core.openTab()}>
        <Icon name="plus" size={13} />
      </button>
      <div className="tab-groups-wrap">
        <button id="btn-tab-groups" title="Tab groups" aria-expanded={groupsOpen} onClick={() => setGroupsOpen((open) => !open)}>
          <Icon name="layout-grid" size={13} />
        </button>
        {groupsOpen && (
          <div className="tab-ctx-menu tab-groups-menu">
            <div className="tab-groups-head"><div><strong>Tab groups</strong><small>Drag any tab onto a group label.</small></div><button title="Close tab groups" onClick={() => setGroupsOpen(false)}>×</button></div>
            {createForTab !== null ? (
              <form className="tab-group-create" onSubmit={submitGroup}>
                <input autoFocus value={newGroupName} onChange={(event) => setNewGroupName(event.currentTarget.value)} placeholder="Group name" maxLength={40} />
                <div className="tab-group-color-row">{GROUP_COLORS.map((color) => <button type="button" key={color} aria-label={`Use ${color}`} className={newGroupColor === color ? "active" : ""} style={{ background: color }} onClick={() => setNewGroupColor(color)} />)}</div>
                <div><button type="button" onClick={() => setCreateForTab(null)}>Cancel</button><button type="submit" className="primary" disabled={!newGroupName.trim()}>Create group</button></div>
              </form>
            ) : (
              <button className="tab-group-new" onClick={() => { const active = tabs.find((tab) => tab.active); if (active) beginCreateGroup(active.id); }} disabled={!tabs.some((tab) => tab.active)}><Icon name="plus" size={12} /> Group active tab</button>
            )}
            {tabGroups.length > 0 && <div className="tab-menu-label">Open now</div>}
            <div className="tab-group-cards">
              {tabGroups.map((group) => {
                const count = tabs.filter((tab) => tab.groupId === group.id).length;
                const editing = editingGroupId === group.id;
                return <section key={group.id} className="tab-group-card" style={{ "--group-color": group.color } as CSSProperties}>
                  <div className="tab-group-card-title"><i />{editing ? <form onSubmit={(event) => { event.preventDefault(); if (core.renameTabGroup(group.id, editingName)) setEditingGroupId(null); }}><input autoFocus value={editingName} onChange={(event) => setEditingName(event.currentTarget.value)} maxLength={40} /><button title="Save name" type="submit"><Icon name="check" size={11} /></button></form> : <button onClick={() => core.toggleTabGroup(group.id)}><strong>{group.name}</strong><small>{count} tab{count === 1 ? "" : "s"} · {group.collapsed ? "collapsed" : "open"}</small></button>}<button title={`Rename ${group.name}`} onClick={() => { setEditingGroupId(group.id); setEditingName(group.name); }}><Icon name="square-pen" size={11} /></button></div>
                  <div className="tab-group-color-row compact">{GROUP_COLORS.map((color) => <button key={color} aria-label={`Set ${group.name} color to ${color}`} className={group.color === color ? "active" : ""} style={{ background: color }} onClick={() => core.setTabGroupColor(group.id, color)} />)}</div>
                  <div className="tab-group-card-actions">
                    <button onClick={() => core.toggleTabGroup(group.id)}>{group.collapsed ? "Expand" : "Collapse"}</button>
                    <button onClick={() => { if (core.saveTabGroup(group.id)) toast.success(`Saved “${group.name}”`); }}>Save</button>
                    <button onClick={() => core.ungroupTabGroup(group.id)}>Ungroup</button>
                    <button className="danger" onClick={() => { const closed = core.closeTabGroup(group.id); toast.info(`Closed ${closed} tab${closed === 1 ? "" : "s"}`); }}>Close tabs</button>
                  </div>
                </section>;
              })}
            </div>
            <div className="tab-menu-label">Saved for later</div>
            {savedTabGroups.length ? <div className="tab-saved-groups">{savedTabGroups.map((group) => <div key={group.id} className="tab-saved-group-item"><button onClick={() => { core.reopenSavedTabGroup(group.id); toast.success(`Reopened “${group.name}”`); setGroupsOpen(false); }}><i style={{ background: group.color }} /><span><strong>{group.name}</strong><small>{group.tabs.length} tabs</small></span></button><button title={`Delete saved group ${group.name}`} onClick={() => core.deleteSavedTabGroup(group.id)}><Icon name="delete" size={11} /></button></div>)}</div> : <div className="tab-menu-empty">Save a group to bring the whole set back later.</div>}
          </div>
        )}
      </div>

      {ctxMenu && (
        <div
          className="tab-ctx-menu"
          style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 100 }}
          onClick={() => setCtxMenu(null)}
        >
          <button className="tab-ctx-item" onClick={() => { core.togglePinTab(ctxMenu.id); setCtxMenu(null); }}>
            {tabs.find((t) => t.id === ctxMenu.id)?.pinned ? "Unpin" : "Pin"}
          </button>
          {tabs.find((tab) => tab.id === ctxMenu.id)?.groupId ? (
            <button className="tab-ctx-item" onClick={() => { core.addTabToGroup(ctxMenu.id, null); setCtxMenu(null); }}>Remove from group</button>
          ) : (
            <button className="tab-ctx-item" onClick={() => beginCreateGroup(ctxMenu.id)}>Add to new group…</button>
          )}
          {tabGroups.filter((group) => group.id !== tabs.find((tab) => tab.id === ctxMenu.id)?.groupId).map((group) => (
            <button key={group.id} className="tab-ctx-item" onClick={() => { core.addTabToGroup(ctxMenu.id, group.id); setCtxMenu(null); }}>Move to {group.name}</button>
          ))}
          <button className="tab-ctx-item" onClick={() => { core.closeTab(ctxMenu.id); setCtxMenu(null); }}>
            Close tab
          </button>
          <button className="tab-ctx-item" onClick={() => { core.reloadTab(ctxMenu.id); setCtxMenu(null); }}>
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
