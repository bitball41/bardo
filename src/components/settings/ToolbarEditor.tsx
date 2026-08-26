import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  TOOLBAR_ITEM_BY_ID,
  TOOLBAR_ITEMS,
  paneOf,
  type ToolbarEntry,
  type ToolbarItemDef,
} from "@/lib/toolbar";
import { toast } from "@/lib/toast";
import { core, useBardoSelector } from "@/lib/useCore";
import { cn } from "@/lib/utils";

const NAVIGATION_IDS = new Set([
  "back",
  "forward",
  "reload",
  "home",
  "address",
  "new-tab",
]);

const LAYOUT_IDS = new Set(["separator", "spacer"]);

function SeparatorGlyph() {
  return (
    <svg className="tbe-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="8" y1="3" x2="8" y2="13" />
    </svg>
  );
}

function SpacerGlyph() {
  return (
    <svg className="tbe-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4.5,5.5 2,8 4.5,10.5" />
      <polyline points="11.5,5.5 14,8 11.5,10.5" />
      <line x1="2" y1="8" x2="14" y2="8" strokeDasharray="1.5 2" />
    </svg>
  );
}

function ItemGlyph({ def, size = 15 }: { def: ToolbarItemDef; size?: number }) {
  if (def.id === "separator") return <SeparatorGlyph />;
  if (def.id === "spacer") return <SpacerGlyph />;
  return def.icon ? <Icon name={def.icon} size={size} anim="none" /> : null;
}

function ToolbarPreview({ entries }: { entries: ToolbarEntry[] }) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const drag = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null);

  const entryKeyAtPoint = (x: number, y: number): string | null => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-tbe-preview-key]");
    return element?.dataset.tbePreviewKey ?? null;
  };

  const endDrag = () => {
    drag.current = null;
    setDragKey(null);
    setOverKey(null);
    document.body.classList.remove("toolbar-preview-dragging");
  };

  return (
    <div className="tbe-preview-block">
      <div className="tbe-preview-label">preview</div>
      <div className="tbe-preview" role="toolbar" aria-label="Rearrange toolbar preview">
        {entries.map((entry, index) => {
          const def = TOOLBAR_ITEM_BY_ID.get(entry.id);
          if (!def) return null;

          return (
            <button
              type="button"
              key={entry.key}
              data-tbe-preview-key={entry.key}
              className={cn(
                "tbe-preview-control",
                entry.id === "address" && "tbe-preview-address",
                entry.id === "separator" && "tbe-preview-separator",
                entry.id === "spacer" && "tbe-preview-spacer",
                paneOf(entry.id) && "tbe-preview-pane",
                dragKey === entry.key && "dragging",
                overKey === entry.key && "drag-over",
              )}
              aria-label={`${def.label}, position ${index + 1} of ${entries.length}`}
              title={`Drag to rearrange ${def.label}`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                drag.current = { key: entry.key, x: event.clientX, y: event.clientY, moved: false };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const activeDrag = drag.current;
                if (!activeDrag) return;
                if (!activeDrag.moved) {
                  if (Math.hypot(event.clientX - activeDrag.x, event.clientY - activeDrag.y) < 5) return;
                  activeDrag.moved = true;
                  setDragKey(activeDrag.key);
                  document.body.classList.add("toolbar-preview-dragging");
                }
                const over = entryKeyAtPoint(event.clientX, event.clientY);
                setOverKey(over && over !== activeDrag.key ? over : null);
              }}
              onPointerUp={(event) => {
                const activeDrag = drag.current;
                if (!activeDrag) return;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                if (activeDrag.moved) {
                  const targetKey = entryKeyAtPoint(event.clientX, event.clientY);
                  const targetIndex = entries.findIndex((item) => item.key === targetKey);
                  if (targetKey && targetKey !== activeDrag.key && targetIndex !== -1) {
                    core.moveToolbarItem(activeDrag.key, targetIndex);
                  }
                }
                endDrag();
              }}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  core.moveToolbarItem(entry.key, index - 1);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  core.moveToolbarItem(entry.key, index + 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  core.moveToolbarItem(entry.key, 0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  core.moveToolbarItem(entry.key, entries.length - 1);
                }
              }}
            >
              <ItemGlyph def={def} size={13} />
              {entry.id === "address" && <span>search or enter address</span>}
            </button>
          );
        })}
      </div>
      <p className="tbe-preview-help">
        drag to move
      </p>
    </div>
  );
}

export function ToolbarEditor() {
  const toolbar = useBardoSelector((snapshot) => snapshot.toolbar);
  const activeIds = new Set(toolbar.map((entry) => entry.id));
  const actionDefs = TOOLBAR_ITEMS.filter((def) => !def.pane);
  const groups = [
    actionDefs.filter((def) => NAVIGATION_IDS.has(def.id)),
    actionDefs.filter((def) => !NAVIGATION_IDS.has(def.id) && !LAYOUT_IDS.has(def.id)),
    actionDefs.filter((def) => LAYOUT_IDS.has(def.id)),
    TOOLBAR_ITEMS.filter((def) => def.pane),
  ];

  const toggleItem = (def: ToolbarItemDef, enabled: boolean) => {
    if (enabled) {
      core.addToolbarItem(def.id);
      return;
    }

    const next = toolbar.filter((entry) => entry.id !== def.id);
    if (next.length === 0) {
      toast.error("keep at least one button");
      return;
    }
    core.setToolbar(next);
  };

  return (
    <div className="tbe-editor">
      <ToolbarPreview entries={toolbar} />

      <div className="tbe-list" aria-label="Toolbar buttons">
        {groups.map((group, groupIndex) => (
          <div className="tbe-group" key={groupIndex}>
            {group.map((def) => {
              const enabled = activeIds.has(def.id);
              const isOnlyItem = enabled && toolbar.length === 1;
              const inputId = `toolbar-${def.id.replace(":", "-")}`;

              return (
                <label className="tbe-toggle-row" htmlFor={inputId} key={def.id} title={def.hint}>
                  <span className="tbe-row-icon" aria-hidden>
                    <ItemGlyph def={def} />
                  </span>
                  <span className="tbe-row-label">{def.label}</span>
                  <span className="toggle-wrap">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="toggle-input"
                      checked={enabled}
                      disabled={isOnlyItem}
                      onChange={(event) => toggleItem(def, event.currentTarget.checked)}
                    />
                    <span className="toggle-track" />
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </div>

      <ConfirmButton
        className="action-btn tbe-reset"
        label="reset"
        confirmLabel="click again to reset"
        icon="refresh-ccw"
        onConfirm={() => {
          core.resetToolbar();
          toast.success("toolbar reset");
        }}
      />
    </div>
  );
}
