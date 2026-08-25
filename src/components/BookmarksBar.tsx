import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { core, useBardoSelector } from "@/lib/useCore";
import { toast } from "@/lib/toast";
import type { Bookmark } from "@/lib/types";

type Panel = { kind: "library" } | { kind: "folder"; folder: string } | { kind: "editor"; bookmark?: Bookmark };

const faviconFor = (url: string) => {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return "";
  }
};

function BookmarkGlyph({ bookmark }: { bookmark: Bookmark }) {
  const favicon = faviconFor(bookmark.url);
  return (
    <span className="bm-glyph">
      {favicon ? <img src={favicon} alt="" /> : <Icon name="bookmark" size={12} />}
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
  const activeTab = tabs.find((tab) => tab.active);
  const loose = settings.bookmarks.filter((bookmark) => !bookmark.folder);
  const folders = useMemo(
    () => Array.from(new Set(settings.bookmarks.map((bookmark) => bookmark.folder).filter(Boolean) as string[])),
    [settings.bookmarks],
  );
  const pageBookmarked = settings.bookmarks.some((bookmark) => bookmark.url === activeTab?.url);

  useEffect(() => {
    if (!panel) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("#bookmarks-bar, .bookmarks-popover")) setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);

  const openEditor = (bookmark?: Bookmark) => {
    const current = bookmark || settings.bookmarks.find((candidate) => candidate.url === activeTab?.url);
    setDraft({
      title: current?.title || activeTab?.title || "",
      url: current?.url || activeTab?.url || "",
      folder: current?.folder || "",
      pinnedNewTab: current?.pinnedNewTab || false,
    });
    setPanel({ kind: "editor", bookmark: current });
  };

  const openFolder = (folder: string) => {
    setFolderEdit(null);
    setPanel({ kind: "folder", folder });
  };

  const removeBookmark = (bookmark: Bookmark) => {
    const index = settings.bookmarks.findIndex((candidate) => candidate.id === bookmark.id);
    core.removeBookmark(bookmark.id);
    toast.info("Bookmark removed", { action: { label: "Undo", onClick: () => core.restoreBookmark(bookmark, index) } });
  };

  const saveBookmark = (event: FormEvent) => {
    event.preventDefault();
    if (panel?.kind !== "editor") return;
    if (panel.bookmark) {
      core.updateBookmark(panel.bookmark.id, draft);
      toast.success(`Updated “${draft.title.trim() || panel.bookmark.title}”`);
      setPanel({ kind: "library" });
      return;
    }
    const result = core.createBookmark(draft);
    if (result.status === "invalid") return toast.error("Enter a valid http or https address.");
    if (result.status === "duplicate") return toast.info("That page is already bookmarked.");
    toast.success(`Bookmarked “${result.title}”`);
    setPanel({ kind: "library" });
  };

  const visibleBookmarks = settings.bookmarks.filter((bookmark) => {
    const term = query.trim().toLocaleLowerCase();
    return !term || `${bookmark.title} ${bookmark.url} ${bookmark.folder || ""}`.toLocaleLowerCase().includes(term);
  });

  const libraryRows = (bookmarks: Bookmark[]) =>
    bookmarks.map((bookmark) => (
      <div className="bm-row" key={bookmark.id}>
        <button
          className="bm-row-open"
          title={bookmark.url}
          onClick={() => {
            core.navigate(bookmark.url);
            setPanel(null);
          }}
        >
          <BookmarkGlyph bookmark={bookmark} />
          <span className="bm-row-copy">
            <strong>{bookmark.title}</strong>
            <small>{bookmark.folder || (() => { try { return new URL(bookmark.url).hostname; } catch { return bookmark.url; } })()}</small>
          </span>
        </button>
        {bookmark.pinnedNewTab && (
          <span className="bm-pin" title="Pinned to New Tab">
            <Icon name="home" size={10} />
          </span>
        )}
        <button className="bm-icon" title={`Edit ${bookmark.title}`} onClick={() => openEditor(bookmark)}>
          <Icon name="square-pen" size={12} />
        </button>
        <button className="bm-icon danger" title={`Remove ${bookmark.title}`} onClick={() => removeBookmark(bookmark)}>
          <Icon name="delete" size={12} />
        </button>
      </div>
    ));

  const popover =
    panel &&
    createPortal(
      <section className="bookmarks-popover" aria-label="Bookmarks">
        {panel.kind === "editor" ? (
          <form onSubmit={saveBookmark}>
            <header className="bm-head">
              <div>
                <strong>{panel.bookmark ? "Edit bookmark" : "Add bookmark"}</strong>
                <small>Name, address, optional folder</small>
              </div>
              <button type="button" className="bm-icon" title="Close" onClick={() => setPanel(null)} aria-label="Close">
                ×
              </button>
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
                <input list="bookmark-folder-options" value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.currentTarget.value })} placeholder="Optional" />
              </label>
              <label className="bm-check">
                <input type="checkbox" checked={draft.pinnedNewTab} onChange={(event) => setDraft({ ...draft, pinnedNewTab: event.currentTarget.checked })} />
                <span>Show on New Tab</span>
              </label>
            </div>
            <datalist id="bookmark-folder-options">{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
            <footer className="bm-foot">
              {panel.bookmark && (
                <button type="button" className="bm-text danger" onClick={() => { removeBookmark(panel.bookmark!); setPanel({ kind: "library" }); }}>
                  Remove
                </button>
              )}
              <span className="bm-spacer" />
              <button type="button" className="bm-text" onClick={() => setPanel({ kind: "library" })}>
                Cancel
              </button>
              <button type="submit" className="bm-primary">
                {panel.bookmark ? "Save" : "Add"}
              </button>
            </footer>
          </form>
        ) : panel.kind === "folder" ? (
          <>
            <header className="bm-head">
              <div>
                <strong>{panel.folder}</strong>
                <small>{settings.bookmarks.filter((bookmark) => bookmark.folder === panel.folder).length} pages</small>
              </div>
              <button className="bm-icon" title="Close" onClick={() => setPanel(null)}>
                ×
              </button>
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
                <button type="button" className="bm-text" onClick={() => setFolderEdit(null)}>Cancel</button>
                <button type="submit" className="bm-primary" disabled={!folderEdit.trim()}>Save</button>
              </form>
            ) : (
              <div className="bm-toolbar">
                <button
                  type="button"
                  onClick={() => {
                    const count = core.openBookmarkFolderAsGroup(panel.folder);
                    toast.success(`Opened ${count} pages as “${panel.folder}”`);
                    setPanel(null);
                  }}
                >
                  <Icon name="layout-grid" size={12} /> Open group
                </button>
                <button type="button" onClick={() => setFolderEdit(panel.folder)}>
                  <Icon name="square-pen" size={12} /> Rename
                </button>
              </div>
            )}
            <div className="bm-list">{libraryRows(settings.bookmarks.filter((bookmark) => bookmark.folder === panel.folder))}</div>
          </>
        ) : (
          <>
            <header className="bm-head">
              <div>
                <strong>Bookmarks</strong>
                <small>
                  {settings.bookmarks.length} saved
                  {folders.length ? ` · ${folders.length} folders` : ""}
                </small>
              </div>
              <button className="bm-icon" title="Close" onClick={() => setPanel(null)}>
                ×
              </button>
            </header>
            <div className="bm-search">
              <Icon name="search" size={13} />
              <input autoFocus value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search" />
              {query && (
                <button type="button" title="Clear" onClick={() => setQuery("")}>
                  ×
                </button>
              )}
            </div>
            {folders.length > 0 && !query && (
              <div className="bm-folders">
                {folders.map((folder) => (
                  <button key={folder} type="button" onClick={() => openFolder(folder)}>
                    <Icon name="layout-grid" size={12} />
                    <span>{folder}</span>
                    <small>{settings.bookmarks.filter((bookmark) => bookmark.folder === folder).length}</small>
                  </button>
                ))}
              </div>
            )}
            <div className="bm-list">
              {visibleBookmarks.length ? libraryRows(visibleBookmarks) : <div className="bm-empty">{query ? `No matches for “${query}”` : "No bookmarks yet"}</div>}
            </div>
            <footer className="bm-foot">
              <button type="button" className="bm-primary wide" onClick={() => openEditor()}>
                <Icon name="plus" size={12} /> Add bookmark
              </button>
            </footer>
          </>
        )}
      </section>,
      document.body,
    );

  return (
    <>
      <div id="bookmarks-bar" className={settings.bookmarksVisible ? "visible" : ""}>
        <div id="bookmarks-list">
          {loose.map((bookmark) => (
            <button key={bookmark.id} className="bookmark-item" title={bookmark.url} onClick={() => core.navigate(bookmark.url)}>
              <BookmarkGlyph bookmark={bookmark} />
              <span className="bm-title">{bookmark.title}</span>
            </button>
          ))}
          {folders.map((folder) => {
            const count = settings.bookmarks.filter((bookmark) => bookmark.folder === folder).length;
            return (
              <button key={folder} className="bookmark-item bookmark-folder" title={`Browse ${folder}`} onClick={() => openFolder(folder)}>
                <span className="bm-folder-mark">
                  <Icon name="layout-grid" size={11} />
                </span>
                <span className="bm-title">{folder}</span>
                <small>{count}</small>
              </button>
            );
          })}
          {settings.bookmarks.length === 0 && (
            <button className="bookmarks-empty" onClick={() => openEditor()}>
              Save pages here
            </button>
          )}
        </div>
        <button
          className="bm-bar-btn"
          title="Manage bookmarks"
          aria-expanded={panel?.kind === "library"}
          onClick={() => setPanel(panel?.kind === "library" ? null : { kind: "library" })}
        >
          <Icon name="search" size={12} />
        </button>
        <button id="btn-add-bookmark" className="bm-bar-btn accent" title="Bookmark this page" onClick={() => openEditor()}>
          <Icon name="bookmark" size={12} />
          <span>{pageBookmarked ? "Edit" : "Add"}</span>
        </button>
      </div>
      {popover}
    </>
  );
}
