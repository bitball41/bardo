import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { core, useBardoSelector } from "@/lib/useCore";
import { toast } from "@/lib/toast";
import type { Bookmark } from "@/lib/types";

type Panel =
  | { kind: "manager"; folder?: string }
  | { kind: "folder"; folder: string }
  | { kind: "editor"; bookmark?: Bookmark };

const faviconFor = (url: string) => {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return "";
  }
};

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function BookmarkGlyph({ bookmark, size = 14 }: { bookmark: Bookmark; size?: number }) {
  const favicon = faviconFor(bookmark.url);
  return (
    <span className="bm-glyph" style={{ width: size, height: size }}>
      {favicon ? <img src={favicon} alt="" /> : <Icon name="bookmark" size={size - 2} />}
    </span>
  );
}

export function BookmarksBar() {
  const settings = useBardoSelector((snapshot) => snapshot.settings);
  const tabs = useBardoSelector((snapshot) => snapshot.tabs);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [query, setQuery] = useState("");
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", url: "", folder: "", pinnedNewTab: false });
  const [dragId, setDragId] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; bookmark: Bookmark } | null>(null);
  const activeTab = tabs.find((tab) => tab.active);
  const currentBookmark = settings.bookmarks.find((bookmark) => bookmark.url === activeTab?.url);
  const loose = settings.bookmarks.filter((bookmark) => !bookmark.folder);
  const folders = useMemo(
    () => Array.from(new Set(settings.bookmarks.map((bookmark) => bookmark.folder).filter(Boolean) as string[])),
    [settings.bookmarks],
  );

  useEffect(() => {
    if (!panel && !menu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("#bookmarks-bar, .bm-sheet, .bm-menu")) {
        setPanel(null);
        setMenu(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(null);
        setMenu(null);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [panel, menu]);

  const openEditor = (bookmark?: Bookmark) => {
    const current = bookmark || currentBookmark;
    setDraft({
      title: current?.title || activeTab?.title || "",
      url: current?.url || activeTab?.url || "",
      folder: current?.folder || "",
      pinnedNewTab: current?.pinnedNewTab || false,
    });
    setMenu(null);
    setPanel({ kind: "editor", bookmark: current });
  };

  const removeBookmark = (bookmark: Bookmark) => {
    const index = settings.bookmarks.findIndex((candidate) => candidate.id === bookmark.id);
    core.removeBookmark(bookmark.id);
    setMenu(null);
    toast.info("Bookmark removed", { action: { label: "Undo", onClick: () => core.restoreBookmark(bookmark, index) } });
  };

  const saveBookmark = (event: FormEvent) => {
    event.preventDefault();
    if (panel?.kind !== "editor") return;
    if (panel.bookmark) {
      core.updateBookmark(panel.bookmark.id, draft);
      toast.success(`Updated “${draft.title.trim() || panel.bookmark.title}”`);
      setPanel({ kind: "manager" });
      return;
    }
    const result = core.createBookmark(draft);
    if (result.status === "invalid") return toast.error("Enter a valid http or https address.");
    if (result.status === "duplicate") return toast.info("That page is already bookmarked.");
    toast.success(`Bookmarked “${result.title}”`);
    setPanel({ kind: "manager" });
  };

  const visibleBookmarks = settings.bookmarks.filter((bookmark) => {
    const term = query.trim().toLocaleLowerCase();
    if (panel?.kind === "manager" && panel.folder) return bookmark.folder === panel.folder && (!term || `${bookmark.title} ${bookmark.url}`.toLocaleLowerCase().includes(term));
    return !term || `${bookmark.title} ${bookmark.url} ${bookmark.folder || ""}`.toLocaleLowerCase().includes(term);
  });

  const onBarDragStart = (event: DragEvent, bookmark: Bookmark) => {
    setDragId(bookmark.id);
    event.dataTransfer.effectAllowed = "move";
  };

  const onBarDrop = (bookmark: Bookmark) => {
    if (dragId == null || dragId === bookmark.id) return;
    const index = settings.bookmarks.findIndex((candidate) => candidate.id === bookmark.id);
    core.moveBookmarkTo(dragId, index);
    setDragId(null);
  };

  const rows = (bookmarks: Bookmark[]) =>
    bookmarks.map((bookmark) => (
      <div className="bm-row" key={bookmark.id}>
        <button
          className="bm-row-open"
          title={hostOf(bookmark.url)}
          onClick={() => {
            core.navigate(bookmark.url);
            setPanel(null);
          }}
        >
          <BookmarkGlyph bookmark={bookmark} size={16} />
          <span>
            <strong>{bookmark.title}</strong>
            <small>{bookmark.folder ? `${bookmark.folder} · ${hostOf(bookmark.url)}` : hostOf(bookmark.url)}</small>
          </span>
        </button>
        {bookmark.pinnedNewTab && (
          <span className="bm-pin" title="Pinned to New Tab">
            <Icon name="home" size={11} />
          </span>
        )}
        <button className="bm-icon" title={`Edit ${bookmark.title}`} onClick={() => openEditor(bookmark)}>
          <Icon name="square-pen" size={13} />
        </button>
        <button className="bm-icon danger" title={`Remove ${bookmark.title}`} onClick={() => removeBookmark(bookmark)}>
          <Icon name="delete" size={13} />
        </button>
      </div>
    ));

  const sheet = panel && createPortal(
    <section className="bm-sheet" role="dialog" aria-label="Bookmarks">
      {panel.kind === "editor" ? (
        <form onSubmit={saveBookmark}>
          <header className="bm-head">
            <div>
              <strong>{panel.bookmark ? "Edit bookmark" : "Add bookmark"}</strong>
              <small>Name, address, and an optional folder.</small>
            </div>
            <button type="button" className="bm-icon" title="Close" onClick={() => setPanel(null)}>×</button>
          </header>
          <div className="bm-fields">
            <label>
              <span>Name</span>
              <input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })} placeholder="Page name" />
            </label>
            <label>
              <span>Address</span>
              <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.currentTarget.value })} placeholder="https://example.com" />
            </label>
            <label>
              <span>Folder</span>
              <input list="bookmark-folder-options" value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.currentTarget.value })} placeholder="None" />
            </label>
            <label className="bm-check">
              <input type="checkbox" checked={draft.pinnedNewTab} onChange={(event) => setDraft({ ...draft, pinnedNewTab: event.currentTarget.checked })} />
              <span>Pin to New Tab</span>
            </label>
          </div>
          <datalist id="bookmark-folder-options">{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
          <footer className="bm-actions">
            {panel.bookmark && (
              <button type="button" className="bm-text danger" onClick={() => { removeBookmark(panel.bookmark!); setPanel({ kind: "manager" }); }}>
                Remove
              </button>
            )}
            <span />
            <button type="button" className="bm-ghost" onClick={() => setPanel({ kind: "manager" })}>Cancel</button>
            <button type="submit" className="bm-primary">{panel.bookmark ? "Save" : "Add"}</button>
          </footer>
        </form>
      ) : panel.kind === "folder" ? (
        <>
          <header className="bm-head">
            <div>
              <strong>{panel.folder}</strong>
              <small>{settings.bookmarks.filter((bookmark) => bookmark.folder === panel.folder).length} pages</small>
            </div>
            <button className="bm-icon" title="Close" onClick={() => setPanel(null)}>×</button>
          </header>
          {folderEdit !== null ? (
            <form
              className="bm-rename"
              onSubmit={(event) => {
                event.preventDefault();
                const next = folderEdit.trim().slice(0, 40);
                if (core.renameBookmarkFolder(panel.folder, next)) {
                  setFolderEdit(null);
                  setPanel({ kind: "folder", folder: next });
                }
              }}
            >
              <input autoFocus value={folderEdit} onChange={(event) => setFolderEdit(event.currentTarget.value)} maxLength={40} aria-label="Folder name" />
              <button type="button" onClick={() => setFolderEdit(null)}>Cancel</button>
              <button type="submit" className="bm-primary" disabled={!folderEdit.trim()}>Save</button>
            </form>
          ) : (
            <div className="bm-toolbar">
              <button onClick={() => { const count = core.openBookmarkFolderAsGroup(panel.folder); toast.success(`Opened ${count} pages as “${panel.folder}”`); setPanel(null); }}>
                <Icon name="layout-grid" size={12} /> Open as group
              </button>
              <button onClick={() => setFolderEdit(panel.folder)}>
                <Icon name="square-pen" size={12} /> Rename
              </button>
            </div>
          )}
          <div className="bm-list">{rows(settings.bookmarks.filter((bookmark) => bookmark.folder === panel.folder))}</div>
        </>
      ) : (
        <>
          <header className="bm-head">
            <div>
              <strong>Bookmarks</strong>
              <small>{settings.bookmarks.length} saved{folders.length ? ` · ${folders.length} folders` : ""}</small>
            </div>
            <button className="bm-icon" title="Close" onClick={() => setPanel(null)}>×</button>
          </header>
          <div className="bm-search">
            <Icon name="search" size={14} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search bookmarks" />
            {query && <button title="Clear search" onClick={() => setQuery("")}>×</button>}
          </div>
          {folders.length > 0 && !query && (
            <nav className="bm-folders" aria-label="Folders">
              <button className={!panel.folder ? "active" : undefined} onClick={() => setPanel({ kind: "manager" })}>
                All
              </button>
              {folders.map((folder) => (
                <button key={folder} className={panel.folder === folder ? "active" : undefined} onClick={() => setPanel({ kind: "manager", folder })}>
                  {folder}
                  <small>{settings.bookmarks.filter((bookmark) => bookmark.folder === folder).length}</small>
                </button>
              ))}
            </nav>
          )}
          <div className="bm-list">
            {visibleBookmarks.length ? rows(visibleBookmarks) : (
              <div className="bm-empty">{query ? `No bookmarks match “${query}”.` : "No bookmarks in this folder yet."}</div>
            )}
          </div>
          <footer className="bm-footer">
            <button onClick={() => openEditor()}>
              <Icon name="plus" size={13} /> Add bookmark
            </button>
          </footer>
        </>
      )}
    </section>,
    document.body,
  );

  const contextMenu = menu && createPortal(
    <div className="bm-menu" style={{ left: menu.x, top: menu.y }} role="menu">
      <button onClick={() => { core.navigate(menu.bookmark.url); setMenu(null); }}>Open</button>
      <button onClick={() => openEditor(menu.bookmark)}>Edit</button>
      <button onClick={() => { core.updateBookmark(menu.bookmark.id, { pinnedNewTab: !menu.bookmark.pinnedNewTab }); setMenu(null); }}>
        {menu.bookmark.pinnedNewTab ? "Unpin from New Tab" : "Pin to New Tab"}
      </button>
      <button className="danger" onClick={() => removeBookmark(menu.bookmark)}>Remove</button>
    </div>,
    document.body,
  );

  return (
    <>
      <div id="bookmarks-bar" className={settings.bookmarksVisible ? "visible" : ""}>
        <div id="bookmarks-list">
          {loose.map((bookmark) => (
            <button
              key={bookmark.id}
              className={`bookmark-item${dragId === bookmark.id ? " dragging" : ""}`}
              title={hostOf(bookmark.url)}
              draggable
              onDragStart={(event) => onBarDragStart(event, bookmark)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onBarDrop(bookmark)}
              onDragEnd={() => setDragId(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ x: event.clientX, y: event.clientY, bookmark });
              }}
              onClick={() => core.navigate(bookmark.url)}
            >
              <BookmarkGlyph bookmark={bookmark} />
              <span className="bm-title">{bookmark.title}</span>
            </button>
          ))}
          {folders.map((folder) => {
            const count = settings.bookmarks.filter((bookmark) => bookmark.folder === folder).length;
            return (
              <button
                key={folder}
                className="bookmark-item bookmark-folder"
                title={`Open ${folder}`}
                onClick={() => { setFolderEdit(null); setPanel({ kind: "folder", folder }); }}
              >
                <span className="bm-folder-mark"><Icon name="layout-grid" size={11} /></span>
                <span className="bm-title">{folder}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
        <button
          className="bm-bar-btn"
          title="Manage bookmarks"
          aria-expanded={panel?.kind === "manager"}
          onClick={() => setPanel(panel?.kind === "manager" ? null : { kind: "manager" })}
        >
          <Icon name="search" size={13} />
        </button>
        <button
          id="btn-add-bookmark"
          className={`bm-bar-btn bm-star${currentBookmark ? " saved" : ""}`}
          title={currentBookmark ? "Edit bookmark" : "Bookmark this page"}
          onClick={() => openEditor()}
        >
          <Icon name="bookmark" size={13} />
        </button>
      </div>
      {sheet}
      {contextMenu}
    </>
  );
}
