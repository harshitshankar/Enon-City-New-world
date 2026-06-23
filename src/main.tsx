import { createRoot } from "react-dom/client";
import "./index.css";
// @ts-expect-error - App is authored in JSX (untyped) for rapid game iteration
import App from "./App.jsx";

createRoot(document.getElementById("root")!).render(<App />);
