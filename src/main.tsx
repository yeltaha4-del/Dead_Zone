import { createRoot } from "react-dom/client";
import { Game } from "./components/Game";
import "./styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<Game />);
