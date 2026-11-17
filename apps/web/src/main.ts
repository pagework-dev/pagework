import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";

const target = document.getElementById("app");
if (target === null) throw new Error("index.html has no #app element");
mount(App, { target });
