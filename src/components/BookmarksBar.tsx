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
  return <span className="bm-library-favicon">{favicon ? <img src={favicon} alt="" /> : <Icon name="bookmark" size={13} />}</span>;
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
  const folders = useMemo(() => Array.from(new Set(settings.bookmarks.map((bookmark) => bookmark.folder).filter(Boolean) as string[])), [settings.bookmarks]);

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

  const libraryRows = (bookmarks: Bookmark[]) => bookmarks.map((bookmark) => (
    <div className="bm-library-row" key={bookmark.id}>
      <button className="bm-library-open" title={bookmark.url} onClick={() => { core.navigate(bookmark.url); setPanel(null); }}>
        <BookmarkGlyph bookmark={bookmark} />
        <span><strong>{bookmark.title}</strong><small>{bookmark.folder || new URL(bookmark.url).hostname}</small></span>
      </button>
      {bookmark.pinnedNewTab && <span className="bm-pin-mark" title="Pinned to New Tab"><Icon name="home" size={10} /></span>}
      <button className="bm-icon-btn" title={`Edit ${bookmark.title}`} onClick={() => openEditor(bookmark)}><Icon name="square-pen" size={12} /></button>
      <button className="bm-icon-btn danger" title={`Remove ${bookmark.title}`} onClick={() => removeBookmark(bookmark)}><Icon name="delete" size={12} /></button>
    </div>
  ));

  const popover = panel && createPortal(
    <section className="bookmarks-popover" aria-label="Bookmarks">
      {panel.kind === "editor" ? (
        <form onSubmit={saveBookmark}>
          <div className="bm-popover-head">
            <div><strong>{panel.bookmark ? "Edit bookmark" : "Add bookmark"}</strong><small>Keep it somewhere useful.</small></div>
            <button type="button" className="bm-icon-btn" title="Close bookmarks" onClick={() => setPanel(null)}>×</button>
          </div>
          <div className="bm-editor-fields">
            <label><span>Name</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })} placeholder="Page name" /></label>
            <label><span>Address</span><input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.currentTarget.value })} placeholder="https://example.com" /></label>
            <label><span>Folder</span><input list="bookmark-folder-options" value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.currentTarget.value })} placeholder="No folder" /></label>
            <label className="bm-pin-toggle"><input type="checkbox" checked={draft.pinnedNewTab} onChange={(event) => setDraft({ ...draft, pinnedNewTab: event.currentTarget.checked })} /><span>Show on New Tab</span></label>
          </div>
          <datalist id="bookmark-folder-options">{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
          <div className="bm-editor-actions">
            {panel.bookmark && <button type="button" className="bm-danger-btn" onClick={() => { removeBookmark(panel.bookmark!); setPanel({ kind: "library" }); }}>Remove</button>}
            <span />
            <button type="button" className="bm-secondary-btn" onClick={() => setPanel({ kind: "library" })}>Cancel</button>
            <button type="submit" className="bm-primary-btn">{panel.bookmark ? "Save changes" : "Add bookmark"}</button>
          </div>
        </form>
      ) : panel.kind === "folder" ? (
        <>
          <div className="bm-popover-head">
            <div><strong>{panel.folder}</strong><small>{settings.bookmarks.filter((bookmark) => bookmark.folder === panel.folder).length} saved pages</small></div>
            <button className="bm-icon-btn" title="Close bookmarks" onClick={() => setPanel(null)}>×</button>
          </div>
          {folderEdit !== null ? <form className="bm-folder-rename" onSubmit={(event) => { event.preventDefault(); const next = folderEdit.trim().slice(0, 40); if (core.renameBookmarkFolder(panel.folder, next)) { setFolderEdit(null); setPanel({ kind: "folder", folder: next }); } }}><input autoFocus value={folderEdit} onChange={(event) => setFolderEdit(event.currentTarget.value)} maxLength={40} aria-label="Folder name" /><button type="button" onClick={() => setFolderEdit(null)}>Cancel</button><button type="submit" className="primary" disabled={!folderEdit.trim()}>Save</button></form> : <div className="bm-folder-toolbar">
            <button onClick={() => { const count = core.openBookmarkFolderAsGroup(panel.folder); toast.success(`Opened ${count} pages as “${panel.folder}”`); setPanel(null); }}><Icon name="layout-grid" size={12} /> Open as group</button>
            <button onClick={() => setFolderEdit(panel.folder)}><Icon name="square-pen" size={12} /> Rename</button>
          </div>}
          <div className="bm-library-list">{libraryRows(settings.bookmarks.filter((bookmark) => bookmark.folder === panel.folder))}</div>
        </>
      ) : (
        <>
          <div className="bm-popover-head">
            <div><strong>Bookmarks</strong><small>{settings.bookmarks.length} saved pages · {folders.length} folders</small></div>
            <button className="bm-icon-btn" title="Close bookmarks" onClick={() => setPanel(null)}>×</button>
          </div>
          <div className="bm-search"><Icon name="search" size={13} /><input autoFocus value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search bookmarks" />{query && <button title="Clear search" onClick={() => setQuery("")}>×</button>}</div>
          {folders.length > 0 && !query && <div className="bm-folder-grid">{folders.map((folder) => <button key={folder} onClick={() => openFolder(folder)}><Icon name="layout-grid" size={12} /><span>{folder}</span><small>{settings.bookmarks.filter((bookmark) => bookmark.folder === folder).length}</small></button>)}</div>}
          <div className="bm-library-list">{visibleBookmarks.length ? libraryRows(visibleBookmarks) : <div className="bm-library-empty">No bookmarks match “{query}”.</div>}</div>
          <div className="bm-library-footer"><button onClick={() => openEditor()}><Icon name="plus" size={12} /> Add bookmark</button></div>
        </>
      )}
    </section>,
    document.body,
  );

  return (
    <>
      <div id="bookmarks-bar" className={settings.bookmarksVisible ? "visible" : ""}>
        <div id="bookmarks-list">
          {loose.map((bookmark) => <button key={bookmark.id} className="bookmark-item" title={bookmark.url} onClick={() => core.navigate(bookmark.url)}><BookmarkGlyph bookmark={bookmark} /><span className="bm-title">{bookmark.title}</span></button>)}
          {folders.map((folder) => {
            const count = settings.bookmarks.filter((bookmark) => bookmark.folder === folder).length;
            return <button key={folder} className="bookmark-item bookmark-folder" title={`Browse ${folder}`} onClick={() => openFolder(folder)}><span className="bm-favicon"><Icon name="layout-grid" size={11} /></span><span className="bm-title">{folder}</span><small>{count}</small></button>;
          })}
          {settings.bookmarks.length === 0 && <button className="bookmarks-empty" onClick={() => openEditor()}>Your bookmarks will live here</button>}
        </div>
        <button className="bm-bar-icon" title="Search and manage bookmarks" aria-expanded={panel?.kind === "library"} onClick={() => setPanel(panel?.kind === "library" ? null : { kind: "library" })}><Icon name="search" size={12} /></button>
        <button id="btn-add-bookmark" className="bm-add-btn" title="Bookmark this page" onClick={() => openEditor()}><Icon name="bookmark" size={12} /><span>{settings.bookmarks.some((bookmark) => bookmark.url === activeTab?.url) ? "Edit" : "Add"}</span></button>
      </div>
      {popover}
    </>
  );
}
