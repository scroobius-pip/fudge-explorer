import "./index.ts";
import "./home.css";
import "./site.css";
import { bindHome } from "./home-page.ts";

const root = document.querySelector(".home");
if (root) bindHome(root);
