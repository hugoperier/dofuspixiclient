import { createRoot } from "react-dom/client";

import { installDevtools } from "@/utils/devtools";

import "./index.css";
import "./typography.css";

import { App } from "./App";

// Before anything else: arms the trace channels from `?trace=`, starts the log
// shipper, and puts `__trace` / `__dumpLogs` on `window`. A dev build only —
// it returns immediately otherwise. First so that whatever the boot itself
// logs is already being recorded.
installDevtools();

async function start() {
  // @TODO: fix later — force-load fonts before mount so PixiJS can use them
  await Promise.all([
    document.fonts.load('normal 12px "bit-mini-6"'),
    document.fonts.load('bold 12px "impact"'),
    document.fonts.load('bold 12px "eras"'),
  ]);

  const appEl = document.getElementById("app");

  if (!appEl) {
    throw new Error("Root element #app not found in index.html");
  }

  const root = createRoot(appEl);
  root.render(<App />);
}

start();
