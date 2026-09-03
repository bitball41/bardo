import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/legacy.css";
import "./styles/icons.css";
import "./styles/additions.css";
import App from "./App.tsx";

document.getElementById("boot")?.remove();
createRoot(document.getElementById("root")!).render(
  <App />,
);
