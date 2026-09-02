import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/legacy.css";
import "./styles/icons.css";
import "./styles/additions.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <App />,
);

// The downloadable launcher waits for this handshake before closing itself.
// `postMessage` preserves Bardo's own HTTPS origin; the launcher never reads or
// injects the application document.
if (window.parent !== window) {
  requestAnimationFrame(() => {
    window.parent.postMessage({ type: "bardo:ready", version: 1 }, "*");
  });
}
