import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "@fontsource/barlow-semi-condensed/700.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./state";

createRoot(document.getElementById("root")!).render(<AppProvider><App /></AppProvider>);
