/**
 * Closed-shadow helpers for keeping live destination URLs out of the light DOM.
 * Page-level content scripts see `element.shadowRoot === null` and do not pick
 * up text/values inside a closed tree via innerHTML / textContent / querySelector.
 */

export function copyDocumentStyles(shadow: ShadowRoot, doc: Document) {
  for (const node of doc.querySelectorAll("style, link[rel='stylesheet']")) {
    shadow.appendChild(node.cloneNode(true));
  }
}

export function attachClosedMount(host: HTMLElement): { mount: HTMLElement; shadow: ShadowRoot } {
  const doc = host.ownerDocument;
  const shadow = host.attachShadow({ mode: "closed" });
  copyDocumentStyles(shadow, doc);
  const mount = doc.createElement("div");
  mount.setAttribute("data-closed-mount", "");
  mount.style.cssText = "display:flex;align-items:center;width:100%;height:100%;min-width:0;";
  shadow.appendChild(mount);
  return { mount, shadow };
}

/**
 * Concatenate everything a page-level scanner typically reads from the light DOM.
 * Closed-shadow contents must not appear here.
 */
export function parentDomHaystack(root: Document | ParentNode = document): string {
  const chunks: string[] = [];
  const doc = "documentElement" in root ? (root as Document) : null;
  if (doc?.documentElement) chunks.push(doc.documentElement.innerHTML);
  const scope: ParentNode = doc ?? root;
  if ("body" in scope && (scope as Document).body) {
    chunks.push((scope as Document).body.innerText || "");
    chunks.push((scope as Document).body.textContent || "");
  } else if ("textContent" in scope) {
    chunks.push((scope as ParentNode as HTMLElement).textContent || "");
  }
  const nodes = scope.querySelectorAll("*");
  for (const el of nodes) {
    for (const attr of el.attributes) chunks.push(attr.value);
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      chunks.push((el as HTMLInputElement).value);
    }
    if (tag === "IFRAME") {
      const frame = el as HTMLIFrameElement;
      chunks.push(frame.src);
      chunks.push(frame.getAttribute("src") || "");
    }
  }
  return chunks.join("\n");
}

export function parentDomExposes(haystack: string, destUrl: string): string[] {
  const hits: string[] = [];
  const lower = haystack.toLowerCase();
  const dest = destUrl.trim();
  if (dest && lower.includes(dest.toLowerCase())) hits.push("full dest URL");
  try {
    const parsed = new URL(dest);
    const query = parsed.search;
    if (query && query.length > 1 && lower.includes(query.toLowerCase())) hits.push(`query ${query}`);
    const q = parsed.searchParams.get("q");
    if (q) {
      const encoded = `q=${encodeURIComponent(q)}`.toLowerCase();
      const plus = `q=${q.replace(/ /g, "+")}`.toLowerCase();
      const raw = `q=${q}`.toLowerCase();
      if (lower.includes(encoded) || lower.includes(plus) || lower.includes(raw)) hits.push("q= parameter");
    }
  } catch {
    /* not a URL */
  }
  return hits;
}

let addressBarFocus: (() => void) | null = null;

export function setAddressBarFocus(fn: (() => void) | null) {
  addressBarFocus = fn;
}

export function focusAddressBar() {
  addressBarFocus?.();
}
