import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { attachClosedMount } from "@/lib/closed-shadow";

interface ClosedShadowHostProps {
  className?: string;
  style?: CSSProperties;
  id?: string;
  children: ReactNode;
}

/**
 * Renders children into a closed shadow root so live URL/query text is not
 * readable from the parent document. The host stays in the light DOM for layout.
 */
export function ClosedShadowHost({ className, style, id, children }: ClosedShadowHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { mount: node } = attachClosedMount(host);
    setMount(node);
    return () => setMount(null);
  }, []);

  return (
    <>
      <div ref={hostRef} id={id} className={className} style={style} />
      {mount ? createPortal(children, mount) : null}
    </>
  );
}
