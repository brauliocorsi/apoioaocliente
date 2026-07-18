import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    // In dev, remove any leftover service workers + caches so preview is never stale
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => void r.unregister());
    });
    if ("caches" in window) {
      void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
    }
  } else {
    // In production, force-reload once when a new SW takes control so users
    // never see a stale bundle (old sidebar, old menu, etc.)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);

