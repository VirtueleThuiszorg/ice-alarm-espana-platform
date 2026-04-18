import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initSentry } from "./lib/sentry";
import { initWebVitalsReporting } from "./lib/webVitals";
import "./index.css";
import "./i18n";
import App from "./App.tsx";

// Initialize Sentry before rendering
initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Start web vitals monitoring after render
initWebVitalsReporting();
