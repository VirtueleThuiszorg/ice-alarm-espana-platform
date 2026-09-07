import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initSentry } from "./lib/sentry";
import { initWebVitalsReporting } from "./lib/webVitals";
import { applyStoredTextSize } from "./lib/textSize";
import "./index.css";
import "./i18n";
import App from "./App.tsx";

// Initialize Sentry before rendering
initSentry();

// R10's A/A choice, applied BEFORE the first paint. In an effect it would render at the default
// size and then jump, which for a member who chose the large size is the app appearing to ignore
// them once per visit.
applyStoredTextSize();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Start web vitals monitoring after render
initWebVitalsReporting();
