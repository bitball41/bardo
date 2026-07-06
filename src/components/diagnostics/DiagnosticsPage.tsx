import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { useDiagnostics } from "@/lib/useDiagnostics";
import { cn } from "@/lib/utils";
import {
  ConnectionSection,
  EngineSection,
  EventLogSection,
  NetworkSection,
  PerformanceSection,
  RuntimeSection,
  ServiceWorkerSection,
  StorageSection,
} from "./sections";

interface DiagnosticsPageProps {
  open: boolean;
  onClose: () => void;
}

function OverviewHero({ overall, issues }: { overall: "ok" | "warn" | "critical"; issues: { text: string }[] }) {
  const copy = {
    ok: { title: "Healthy", icon: "check" as const, lead: "Everything Bardo needs is running normally." },
    warn: { title: "Minor Issues", icon: "badge-alert" as const, lead: issues[0]?.text ?? "A couple of things could use attention." },
    critical: { title: "Needs Attention", icon: "badge-alert" as const, lead: issues[0]?.text ?? "Something important isn't working." },
  }[overall];

  return (
    <div className={cn("dx-hero", `dx-hero-${overall}`)}>
      <span className="dx-hero-icon">
        <Icon name={copy.icon} size={26} anim="none" />
      </span>
      <div className="dx-hero-copy">
        <div className="dx-hero-title">{copy.title}</div>
        <p className="dx-hero-lead">{copy.lead}</p>
        {issues.length > 1 && (
          <ul className="dx-hero-issues">
            {issues.slice(1).map((issue, index) => (
              <li key={index}>{issue.text}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function DiagnosticsPage({ open, onClose }: DiagnosticsPageProps) {
  const d = useDiagnostics();
  const containerRef = useRef<HTMLDivElement>(null);

  // Focused here (rather than from App.tsx) because this page is lazy-loaded:
  // by the time App's own open-state effect runs, the chunk hasn't mounted yet.
  useEffect(() => {
    if (!open) return;
    const focusable = containerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [open]);

  return (
    <div ref={containerRef} id="diagnostics-page" className={open ? "open" : ""} role="dialog" aria-modal="true" aria-label="Bardo diagnostics">
      <div className="dx-header">
        <button className="nav-btn" title="Close diagnostics" onClick={onClose}>
          <Icon name="arrow-left" size={15} />
        </button>
        <h1>
          <Icon name="file-cog" size={17} />
          Diagnostics
        </h1>
      </div>
      <div className="dx-body">
        <OverviewHero overall={d.overall} issues={d.issues} />
        <div className="dx-cards">
          <ConnectionSection d={d} />
          <EngineSection d={d} />
          <ServiceWorkerSection d={d} />
          <NetworkSection d={d} />
          <StorageSection d={d} />
          <RuntimeSection d={d} />
          <PerformanceSection d={d} />
          <EventLogSection d={d} />
        </div>
      </div>
    </div>
  );
}
