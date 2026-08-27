import { useEffect, useId, useRef } from "react";
import { core, useBardoSelector } from "@/lib/useCore";

export function RestoreTabsPrompt() {
  const prompt = useBardoSelector((snapshot) => snapshot.restorePrompt);
  const titleId = useId();
  const yesRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!prompt) return;
    yesRef.current?.focus();
  }, [prompt]);

  useEffect(() => {
    if (!prompt) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        core.declineRestoreTabs();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prompt]);

  if (!prompt) return null;

  return (
    <div className="restore-prompt-overlay" onClick={() => core.declineRestoreTabs()}>
      <div
        className="restore-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>restore your tabs?</h3>
        <p className="restore-prompt-copy">Bardo closed with tabs open.</p>
        <div className="restore-prompt-actions">
          <button type="button" className="ql-form-btn" onClick={() => core.declineRestoreTabs()}>
            No
          </button>
          <button
            ref={yesRef}
            type="button"
            className="ql-form-btn ql-form-save"
            onClick={() => core.acceptRestoreTabs()}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
