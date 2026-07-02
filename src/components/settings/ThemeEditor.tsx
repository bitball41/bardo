import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { THEMES } from "@/lib/constants";
import {
  ANIMATION_LEVELS,
  BLUR_MAX,
  BLUR_MIN,
  COLOR_FIELDS,
  DENSITIES,
  FONT_OPTIONS,
  OPACITY_MAX,
  OPACITY_MIN,
  RADIUS_MAX,
  RADIUS_MIN,
  THEME_NAME_MAX,
  themeFromBuiltin,
  themeWarnings,
  sanitizeCustomTheme,
  applyThemeToDocument,
} from "@/lib/customThemes";
import { toast } from "@/lib/toast";
import { core, useBardoSelector } from "@/lib/useCore";
import type { CustomTheme, CustomThemeColors } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ThemesSection } from "./sections";

const HEX_INPUT_RE = /^#[0-9a-f]{6}$/i;

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value;
  return (
    <div className="te-color-field">
      <label className="te-color-swatch" title={`${label} — pick a colour`}>
        <input
          type="color"
          value={value}
          aria-label={`${label} colour`}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
        <span style={{ background: value }} />
      </label>
      <div className="te-color-info">
        <span className="setting-name">{label}</span>
        <span className="setting-hint">{hint}</span>
      </div>
      <input
        className="setting-input te-hex-input"
        value={shown}
        aria-label={`${label} hex value`}
        spellCheck={false}
        onFocus={() => {
          setText(value);
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onInput={(e) => {
          const v = e.currentTarget.value;
          setText(v);
          if (HEX_INPUT_RE.test(v)) onChange(v.toLowerCase());
        }}
      />
    </div>
  );
}

function ThemePreviewCard({ draft }: { draft: CustomTheme }) {
  const c = draft.colors;
  const font = FONT_OPTIONS.find((f) => f.id === draft.font) ?? FONT_OPTIONS[0];
  const radius = `${draft.radius}px`;
  const pad = draft.density === "compact" ? 6 : draft.density === "spacious" ? 14 : 10;
  const chromeBg = draft.glass.enabled
    ? `color-mix(in srgb, ${c.surface} ${draft.glass.opacity}%, transparent)`
    : c.surface;
  return (
    <div
      className="te-preview"
      aria-hidden
      style={{
        background: draft.glass.enabled
          ? `linear-gradient(120deg, ${c.accent}33, transparent 40%), ${c.bg}`
          : c.bg,
        borderColor: c.border,
        borderRadius: radius,
        fontFamily: font.stack,
      }}
    >
      <div
        className="te-preview-chrome"
        style={{
          background: chromeBg,
          borderColor: c.border,
          padding: `${pad}px 10px`,
          backdropFilter: draft.glass.enabled ? `blur(${draft.glass.blur}px)` : undefined,
        }}
      >
        <span className="te-preview-dot" style={{ background: c.hover, borderRadius: radius }} />
        <span className="te-preview-dot" style={{ background: c.active, borderRadius: radius }} />
        <span
          className="te-preview-pill"
          style={{ background: c.bg, color: c.muted, borderColor: c.border, borderRadius: radius }}
        >
          bardo.example
        </span>
      </div>
      <div className="te-preview-body" style={{ padding: pad + 4 }}>
        <div style={{ color: c.text, fontSize: 13, fontWeight: 600 }}>Primary text</div>
        <div style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>Muted text looks like this.</div>
        <div className="te-preview-row">
          <span
            className="te-preview-btn"
            style={{ background: c.accent, color: c.accentContrast, borderRadius: radius }}
          >
            Accent
          </span>
          <span
            className="te-preview-btn"
            style={{ background: c.hover, color: c.text, border: `1px solid ${c.border}`, borderRadius: radius }}
          >
            Hover
          </span>
          <span
            className="te-preview-btn"
            style={{ background: c.active, color: c.text, border: `1px solid ${c.border}`, borderRadius: radius }}
          >
            Active
          </span>
        </div>
      </div>
    </div>
  );
}

function ThemeEditor({ initial, onClose }: { initial: CustomTheme; onClose: () => void }) {
  const [draft, setDraft] = useState<CustomTheme>(initial);
  const [livePreview, setLivePreview] = useState(true);
  const isSaved = useBardoSelector((snapshot) => snapshot.customThemes.some((t) => t.id === initial.id));
  const settings = useBardoSelector((snapshot) => snapshot.settings);
  const customThemes = useBardoSelector((snapshot) => snapshot.customThemes);
  const warnings = useMemo(() => themeWarnings(draft.colors), [draft.colors]);

  const patch = (p: Partial<CustomTheme>) => setDraft((d) => ({ ...d, ...p }));
  const patchColor = (key: keyof CustomThemeColors, hex: string) =>
    setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: hex } }));

  useEffect(() => {
    if (!livePreview) return;
    const previewThemes = [...customThemes.filter((theme) => theme.id !== draft.id), draft];
    applyThemeToDocument({ ...settings, theme: draft.id }, previewThemes);
    return () => applyThemeToDocument(settings, customThemes);
  }, [draft, livePreview, settings, customThemes]);

  const exportTheme = () => {
    const blob = new Blob([JSON.stringify({ version: 1, theme: draft }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "bardo-theme"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Theme exported");
  };

  const save = () => {
    if (core.upsertCustomTheme(draft)) {
      core.setSetting("theme", draft.id);
      toast.success(`Theme “${draft.name}” saved and applied`);
      onClose();
    } else {
      toast.error("That theme couldn't be saved.");
    }
  };

  return (
    <div className="theme-editor">
      <div className="te-toolbar">
        <button className="action-btn te-back-btn" onClick={onClose}>
          <Icon name="arrow-left" size={13} />
          Back to themes
        </button>
        <label className="action-btn te-file-btn">
          <Icon name="attach-file" size={13} />Import
          <input type="file" accept="application/json,.json" onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            try {
              const parsed = JSON.parse(await file.text());
              const imported = sanitizeCustomTheme(parsed?.theme ?? parsed);
              if (!imported) throw new Error("Invalid theme file");
              setDraft(imported);
              toast.success(`Imported “${imported.name}”`);
            } catch {
              toast.error("That theme file is invalid or incomplete.");
            }
          }} />
        </label>
        <button className="action-btn" onClick={exportTheme}><Icon name="copy" size={13} />Export</button>
      </div>

      <div className="pane-label">Preview</div>
      <ThemePreviewCard draft={draft} />
      <label className="setting-row toggle-row te-live-toggle">
        <div className="setting-info"><span className="setting-name">Live preview</span><span className="setting-hint">Try changes across Bardo before saving</span></div>
        <span className="toggle-wrap"><input type="checkbox" className="toggle-input" checked={livePreview} onChange={(event) => setLivePreview(event.currentTarget.checked)} /><span className="toggle-track" /></span>
      </label>
      <label className="setting-row toggle-row">
        <div className="setting-info"><span className="setting-name">More contrast</span><span className="setting-hint">Strengthen borders and muted text throughout the interface</span></div>
        <span className="toggle-wrap"><input type="checkbox" className="toggle-input" checked={settings.moreContrast} onChange={(event) => core.setSetting("moreContrast", event.currentTarget.checked)} /><span className="toggle-track" /></span>
      </label>

      <div className="pane-label" style={{ marginTop: 16 }}>Name</div>
      <input
        className="setting-input"
        value={draft.name}
        maxLength={THEME_NAME_MAX}
        aria-label="Theme name"
        onInput={(e) => patch({ name: e.currentTarget.value })}
      />

      <div className="pane-label" style={{ marginTop: 16 }}>Start From a Built-in Theme</div>
      <div className="setting-row">
        <span className="setting-name">Duplicate</span>
        <select
          className="setting-select"
          value={draft.base}
          aria-label="Duplicate a built-in theme"
          onChange={(e) => {
            const def = THEMES.find((t) => t.id === e.currentTarget.value);
            if (!def) return;
            const copy = themeFromBuiltin(def);
            patch({ base: def.id, mode: copy.mode, colors: copy.colors });
          }}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <p className="pane-hint" style={{ marginTop: 6 }}>
        Picking a theme replaces the colours below with that theme's palette.
      </p>

      <div className="pane-label" style={{ marginTop: 10 }}>Colours</div>
      <div className="te-color-grid">
        {COLOR_FIELDS.map((f) => (
          <ColorField
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={draft.colors[f.key]}
            onChange={(hex) => patchColor(f.key, hex)}
          />
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="te-warnings" role="status">
          {warnings.map((w) => (
            <div key={w.message} className="te-warning">
              <Icon name="badge-alert" size={13} />
              <span>
                {w.message} ({w.ratio.toFixed(1)}:1)
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="pane-label" style={{ marginTop: 16 }}>Shape & Type</div>
      <div className="setting-row" style={{ marginBottom: 10 }}>
        <div className="setting-info">
          <span className="setting-name">Corner radius</span>
          <span className="setting-hint">{draft.radius}px</span>
        </div>
        <input
          type="range"
          className="te-slider"
          min={RADIUS_MIN}
          max={RADIUS_MAX}
          value={draft.radius}
          aria-label="Corner radius"
          onInput={(e) => patch({ radius: Number(e.currentTarget.value) })}
        />
      </div>
      <div className="setting-row" style={{ marginBottom: 10 }}>
        <span className="setting-name">Density</span>
        <div className="te-seg" role="group" aria-label="Interface density">
          {DENSITIES.map((d) => (
            <button
              key={d.id}
              className={cn("te-seg-btn", draft.density === d.id && "active")}
              aria-pressed={draft.density === d.id}
              onClick={() => patch({ density: d.id })}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row" style={{ marginBottom: 10 }}>
        <span className="setting-name">Font</span>
        <select
          className="setting-select"
          value={draft.font}
          aria-label="Interface font"
          onChange={(e) => patch({ font: e.currentTarget.value })}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="pane-label" style={{ marginTop: 10 }}>Effects</div>
      <label className="setting-row toggle-row" style={{ marginBottom: 10 }}>
        <div className="setting-info">
          <span className="setting-name">Blur & transparency</span>
          <span className="setting-hint">Frosted-glass toolbar and panels</span>
        </div>
        <span className="toggle-wrap">
          <input
            type="checkbox"
            className="toggle-input"
            checked={draft.glass.enabled}
            onChange={(e) => patch({ glass: { ...draft.glass, enabled: e.currentTarget.checked } })}
          />
          <span className="toggle-track" />
        </span>
      </label>
      {draft.glass.enabled && (
        <>
          <div className="setting-row" style={{ marginBottom: 10 }}>
            <div className="setting-info">
              <span className="setting-name">Blur</span>
              <span className="setting-hint">{draft.glass.blur}px</span>
            </div>
            <input
              type="range"
              className="te-slider"
              min={BLUR_MIN}
              max={BLUR_MAX}
              value={draft.glass.blur}
              aria-label="Blur amount"
              onInput={(e) => patch({ glass: { ...draft.glass, blur: Number(e.currentTarget.value) } })}
            />
          </div>
          <div className="setting-row" style={{ marginBottom: 10 }}>
            <div className="setting-info">
              <span className="setting-name">Opacity</span>
              <span className="setting-hint">{draft.glass.opacity}%</span>
            </div>
            <input
              type="range"
              className="te-slider"
              min={OPACITY_MIN}
              max={OPACITY_MAX}
              value={draft.glass.opacity}
              aria-label="Surface opacity"
              onInput={(e) => patch({ glass: { ...draft.glass, opacity: Number(e.currentTarget.value) } })}
            />
          </div>
        </>
      )}
      <div className="setting-row" style={{ marginBottom: 10 }}>
        <div className="setting-info">
          <span className="setting-name">Animations</span>
          <span className="setting-hint">{ANIMATION_LEVELS.find((a) => a.id === draft.animation)?.hint}</span>
        </div>
        <div className="te-seg" role="group" aria-label="Animation level">
          {ANIMATION_LEVELS.map((a) => (
            <button
              key={a.id}
              className={cn("te-seg-btn", draft.animation === a.id && "active")}
              aria-pressed={draft.animation === a.id}
              onClick={() => patch({ animation: a.id })}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="te-actions">
        <button className="action-btn te-save-btn" onClick={save}>
          <Icon name="check" size={13} />
          Save & apply
        </button>
        <button
          className="action-btn"
          onClick={() => {
            const def = THEMES.find((t) => t.id === draft.base) ?? THEMES[0];
            const fresh = themeFromBuiltin(def);
            setDraft({ ...fresh, id: draft.id, name: draft.name, base: draft.base });
            toast.info("Theme reset to its starting palette");
          }}
        >
          <Icon name="refresh-ccw" size={13} />
          Reset colours & options
        </button>
        {isSaved && (
          <ConfirmButton
            className="action-btn"
            label="Delete theme"
            confirmLabel="Click again to delete"
            icon="delete"
            onConfirm={() => {
              core.deleteCustomTheme(draft.id);
              toast.info(`Theme “${draft.name}” deleted`);
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

export function ThemesPane() {
  const [editing, setEditing] = useState<CustomTheme | null>(null);

  if (editing) {
    return <ThemeEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />;
  }

  return (
    <>
      <ThemesSection
        onEditTheme={(theme) => setEditing(theme)}
        onNewTheme={() => {
          const s = core.getSettings();
          const activeCustom = s.theme.startsWith("custom:")
            ? core.getSnapshot().customThemes.find((t) => t.id === s.theme)
            : null;
          const baseId = activeCustom ? activeCustom.base : s.theme;
          const def = THEMES.find((t) => t.id === baseId) ?? THEMES[0];
          setEditing(themeFromBuiltin(def));
        }}
      />
      <p className="pane-hint" style={{ marginTop: 14 }}>
        Custom themes are saved only in this browser.
      </p>
    </>
  );
}
