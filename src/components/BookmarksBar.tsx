import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { core, useBardoSelector } from "@/lib/useCore";
import { toast } from "@/lib/toast";
import type { Bookmark } from "@/lib/types";

type Panel =
  | { kind: "library"; folder: string | null }
  | { kind: "editor"; bookmark?: Bookmark };

const faviconFor = (url: string) => {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return "";
  }
};

const hostFor = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
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
    setPanel({ kind: "library", folder });
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
      setPanel({ kind: "library", folder: draft.folder.trim() || null });
      return;
    }
    const result = core.createBookmark(draft);
    if (result.status === "invalid") return toast.error("Enter a valid http or https address.");
    if (result.status === "duplicate") return toast.info("That page is already bookmarked.");
    toast.success(`Bookmarked “${result.title}”`);
    setPanel({ kind: "library", folder: draft.folder.trim() || null });
  };

  const selectedFolder = panel?.kind === "library" ? panel.folder : null;
  const visibleBookmarks = settings.bookmarks.filter((bookmark) => {
    const term = query.trim().toLocaleLowerCase();
    const inFolder = selectedFolder === null || (selectedFolder === "" ? !bookmark.folder : bookmark.folder === selectedFolder);
    return inFolder && (!term || `${bookmark.title} ${bookmark.url} ${bookmark.folder || ""}`.toLocaleLowerCase().includes(term));
  });

  const libraryRows = (bookmarks: Bookmark[]) => bookmarks.map((bookmark) => (
    <article className="bm-library-row" key={bookmark.id}>
      <button className="bm-library-open" title={bookmark.url} onClick={() => { core.navigate(bookmark.url); setPanel(null); }}>
        <BookmarkGlyph bookmark={bookmark} />
        <span className="bm-library-copy">
          <strong>{bookmark.title}</strong>
          <small>{hostFor(bookmark.url)}</small>
        </span>
      </button>
      <div className="bm-library-meta">
        {bookmark.folder && <span className="bm-folder-badge">{bookmark.folder}</span>}
        {bookmark.pinnedNewTab && <span className="bm-pin-mark" title="Pinned to New Tab"><Icon name="home" size={11} /></span>}
      </div>
      <div className="bm-library-actions">
        <button className="bm-icon-btn" title={`Edit ${bookmark.title}`} onClick={() => openEditor(bookmark)}><Icon name="square-pen" size={13} /></button>
        <button className="bm-icon-btn danger" title={`Remove ${bookmark.title}`} onClick={() => removeBookmark(bookmark)}><Icon name="delete" size={13} /></button>
      </div>
    </article>
  ));

  const exportBookmarks = () => {
    const blob = new Blob([JSON.stringify({ version: 1, bookmarks: settings.bookmarks }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bardo-bookmarks.json";
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${settings.bookmarks.length} bookmark${settings.bookmarks.length === 1 ? "" : "s"}`);
  };

  const popover = panel && createPortal(
    <section className="bookmarks-popover bm-manager" aria-label="Bookmarks" role="dialog" aria-modal="true">
      {panel.kind === "editor" ? (
        <form onSubmit={saveBookmark}>
          <div className="bm-popover-head">
            <div className="bm-heading">
              <span className="bm-eyebrow">{panel.bookmark ? "Library / Edit" : "Library / New"}</span>
              <strong>{panel.bookmark ? "Edit bookmark" : "Add bookmark"}</strong>
              <small>{panel.bookmark ? "Update the name, folder, or address." : "Save this page somewhere you can find it."}</small>
            </div>
            <button type="button" className="bm-icon-btn" title="Close bookmarks" aria-label="Close bookmarks" onClick={() => setPanel(null)}>×</button>
          </div>
          <div className="bm-editor-fields">
            <label><span>Name</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })} placeholder="Page name" /></label>
            <label><span>Address</span><input type="url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.currentTarget.value })} placeholder="https://example.com" required /></label>
            <label><span>Folder</span><input list="bookmark-folder-options" value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.currentTarget.value })} placeholder="No folder" /></label>
            <label className="bm-pin-toggle"><input type="checkbox" checked={draft.pinnedNewTab} onChange={(event) => setDraft({ ...draft, pinnedNewTab: event.currentTarget.checked })} /><span>Pin to New Tab</span></label>
          </div>
          <datalist id="bookmark-folder-options">{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
          <div className="bm-editor-actions">
            {panel.bookmark && <button type="button" className="bm-danger-btn" onClick={() => { removeBookmark(panel.bookmark!); setPanel({ kind: "library", folder: null }); }}>Remove</button>}
            <span />
            <button type="button" className="bm-secondary-btn" onClick={() => setPanel({ kind: "library", folder: null })}>Back</button>
            <button type="submit" className="bm-primary-btn">{panel.bookmark ? "Save changes" : "Add bookmark"}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="bm-popover-head">
            <div className="bm-heading">
              <span className="bm-eyebrow">Your library</span>
              <strong>Bookmarks</strong>
              <small>{settings.bookmarks.length} saved page{settings.bookmarks.length === 1 ? "" : "s"} · {folders.length} folder{folders.length === 1 ? "" : "s"}</small>
            </div>
            <button className="bm-icon-btn" title="Close bookmarks" aria-label="Close bookmarks" onClick={() => setPanel(null)}>×</button>
          </div>
          <div className="bm-manager-toolbar">
            <div className="bm-search"><Icon name="search" size={14} /><input autoFocus value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search title, address, or folder" aria-label="Search bookmarks" />{query && <button title="Clear search" aria-label="Clear search" onClick={() => setQuery("")}>×</button>}</div>
            <button className="bm-primary-btn bm-toolbar-add" onClick={() => openEditor()}><Icon name="plus" size={13} /> Add page</button>
          </div>
          <div className="bm-manager-body">
            <nav className="bm-folder-nav" aria-label="Bookmark folders">
              <div className="bm-nav-label">Browse</div>
              <button className={selectedFolder === null ? "active" : ""} onClick={() => setPanel({ kind: "library", folder: null })}><Icon name="bookmark" size={14} /><span>All bookmarks</span><small>{settings.bookmarks.length}</small></button>
              <button className={selectedFolder === "" ? "active" : ""} onClick={() => setPanel({ kind: "library", folder: "" })}><Icon name="file-cog" size={14} /><span>Unsorted</span><small>{settings.bookmarks.filter((bookmark) => !bookmark.folder).length}</small></button>
              {folders.length > 0 && <div className="bm-nav-label bm-nav-folders">Folders</div>}
              {folders.map((folder) => (
                <button key={folder} className={selectedFolder === folder ? "active" : ""} onClick={() => openFolder(folder)}>
                  <Icon name="layout-grid" size={14} /><span>{folder}</span><small>{settings.bookmarks.filter((bookmark) => bookmark.folder === folder).length}</small>
                </button>
              ))}
              <div className="bm-nav-note"><Icon name="square-pen" size={12} /><span>Choose a folder while adding or editing a page.</span></div>
            </nav>
            <div className="bm-manager-content">
              <div className="bm-manager-content-head">
                <div><strong>{selectedFolder === null ? "All bookmarks" : selectedFolder === "" ? "Unsorted" : selectedFolder}</strong><small>{visibleBookmarks.length} result{visibleBookmarks.length === 1 ? "" : "s"}{query ? ` for “${query}”` : ""}</small></div>
                {selectedFolder && folderEdit === null && <div className="bm-folder-toolbar"><button onClick={() => { const count = core.openBookmarkFolderAsGroup(selectedFolder); toast.success(`Opened ${count} pages as “${selectedFolder}”`); setPanel(null); }}><Icon name="layout-grid" size={12} /> Open group</button><button onClick={() => setFolderEdit(selectedFolder)}><Icon name="square-pen" size={12} /> Rename</button></div>}
              </div>
              {folderEdit !== null && selectedFolder ? (
                <form className="bm-folder-rename" onSubmit={(event) => { event.preventDefault(); const next = folderEdit.trim().slice(0, 40); if (core.renameBookmarkFolder(selectedFolder, next)) { setFolderEdit(null); setPanel({ kind: "library", folder: next }); } }}>
                  <input autoFocus value={folderEdit} onChange={(event) => setFolderEdit(event.currentTarget.value)} maxLength={40} aria-label="Folder name" />
                  <button type="button" onClick={() => setFolderEdit(null)}>Cancel</button>
                  <button type="submit" className="primary" disabled={!folderEdit.trim()}>Save</button>
                </form>
              ) : null}
              <div className="bm-library-list">{visibleBookmarks.length ? libraryRows(visibleBookmarks) : <div className="bm-library-empty"><Icon name={query ? "search" : "bookmark"} size={22} /><strong>{query ? "No matches" : selectedFolder !== null ? "This folder is empty" : "Your library is empty"}</strong><span>{query ? "Try a different title, address, or folder." : "Add the pages you want close at hand."}</span>{!query && <button className="bm-secondary-btn" onClick={() => openEditor()}><Icon name="plus" size={12} /> Add your first bookmark</button>}</div>}</div>
            </div>
          </div>
          <div className="bm-library-footer">
            <div><span className="bm-footer-status"><Icon name="key-circle" size={12} />Saved locally in this browser</span></div>
            <div className="bm-footer-actions">
              <label className="bm-footer-btn"><Icon name="attach-file" size={12} /> Import<input type="file" accept="application/json,.json" onChange={async (event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; try { const raw = JSON.parse(await file.text()); const count = core.importBookmarks(raw); toast.success(count ? `Imported ${count} bookmark${count === 1 ? "" : "s"}` : "No new bookmarks to import"); } catch (error) { toast.error(error instanceof Error ? error.message : "That bookmarks file is invalid."); } }} /></label>
              <button className="bm-footer-btn" onClick={exportBookmarks} disabled={settings.bookmarks.length === 0}><Icon name="copy" size={12} /> Export</button>
            </div>
          </div>
        </>
      )}
    </section>,
    document.body,
  );

  return (
    <>
      <div id="bookmarks-bar" className={settings.bookmarksVisible ? "visible" : ""}>
        <div className="bm-bar-label"><Icon name="bookmark" size={13} /><span>Bookmarks</span><small>{settings.bookmarks.length}</small></div>
        <div id="bookmarks-list">
          {loose.map((bookmark) => <button key={bookmark.id} className="bookmark-item" title={bookmark.url} onClick={() => core.navigate(bookmark.url)}><BookmarkGlyph bookmark={bookmark} /><span className="bm-title">{bookmark.title}</span></button>)}
          {folders.map((folder) => {
            const count = settings.bookmarks.filter((bookmark) => bookmark.folder === folder).length;
            return <button key={folder} className="bookmark-item bookmark-folder" title={`Browse ${folder}`} onClick={() => openFolder(folder)}><span className="bm-favicon"><Icon name="layout-grid" size={11} /></span><span className="bm-title">{folder}</span><small>{count}</small></button>;
          })}
          {settings.bookmarks.length === 0 && <button className="bookmarks-empty" onClick={() => openEditor()}>Your bookmarks will live here</button>}
        </div>
        <button className="bm-bar-icon" title="Open bookmark library" aria-label="Open bookmark library" aria-expanded={panel?.kind === "library"} onClick={() => setPanel(panel?.kind === "library" ? null : { kind: "library", folder: null })}><Icon name="search" size={13} /></button>
        <button id="btn-add-bookmark" className="bm-add-btn" title="Bookmark this page" onClick={() => openEditor()}><Icon name="bookmark" size={12} /><span>{settings.bookmarks.some((bookmark) => bookmark.url === activeTab?.url) ? "Edit" : "Add"}</span></button>
      </div>
      {popover}
    </>
  );
}
