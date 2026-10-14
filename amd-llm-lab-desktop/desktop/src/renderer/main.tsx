import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./state";

createRoot(document.getElementById("root")!).render(<AppProvider><App /></AppProvider>);
