import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DxIcon, type DxIconName } from "./icons";
import type { HealthLevel } from "@/lib/useDiagnostics";

export function StatusPill({ status, labels }: { status: HealthLevel; labels?: Partial<Record<HealthLevel, string>> }) {
  const defaultLabels: Record<HealthLevel, string> = { ok: "Healthy", warn: "Minor issue", critical: "Needs attention" };
  const text = labels?.[status] ?? defaultLabels[status];
  return <span className={cn("dx-pill", `dx-pill-${status}`)}>{text}</span>;
}

export interface DiagCardProps {
  icon: DxIconName;
  title: string;
  subtitle?: string;
  status: HealthLevel;
  statusLabels?: Partial<Record<HealthLevel, string>>;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: ReactNode;
}

export function DiagCard({ icon, title, subtitle, status, statusLabels, defaultOpen = true, collapsible = true, children }: DiagCardProps) {
  const [open, setOpen] = useState(defaultOpen || status !== "ok");

  useEffect(() => {
    if (status !== "ok") setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <section className={cn("dx-card", `dx-card-${status}`)}>
      <button
        type="button"
        className="dx-card-head"
        aria-expanded={open}
        onClick={() => collapsible && setOpen((o) => !o)}
      >
        <span className="dx-card-icon"><DxIcon name={icon} size={16} /></span>
        <span className="dx-card-heading">
          <span className="dx-card-title">{title}</span>
          {subtitle && <span className="dx-card-subtitle">{subtitle}</span>}
        </span>
        <StatusPill status={status} labels={statusLabels} />
        {collapsible && (
          <span className={cn("dx-chevron", open && "dx-chevron-open")}>
            <DxIcon name="chevron" size={14} />
          </span>
        )}
      </button>
      {open && <div className="dx-card-body">{children}</div>}
    </section>
  );
}

export function DiagRow({ label, value, valueTone }: { label: string; value: ReactNode; valueTone?: HealthLevel }) {
  return (
    <div className="dx-row">
      <span className="dx-row-label">{label}</span>
      <span className={cn("dx-row-value", valueTone && `dx-row-value-${valueTone}`)}>{value}</span>
    </div>
  );
}

export function Meter({ ratio, tone = "ok" }: { ratio: number; tone?: HealthLevel }) {
  const pct = Math.max(0, Math.min(100, ratio * 100));
  return (
    <div className="dx-meter">
      <div className={cn("dx-meter-fill", `dx-meter-fill-${tone}`)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DiagActions({ children }: { children: ReactNode }) {
  return <div className="dx-actions">{children}</div>;
}

export function DiagEmpty({ icon, text }: { icon: DxIconName; text: string }) {
  return (
    <div className="dx-empty">
      <DxIcon name={icon} size={18} />
      <span>{text}</span>
    </div>
  );
}
