import { mount, unmount } from "svelte";
import App from "./App.svelte";
import {
  chooseWithoutAccount,
  chosenWithoutAccount,
  findServer,
  host,
} from "./lib/host.svelte.ts";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/editor.css";

const target = document.getElementById("app");
if (target === null) throw new Error("index.html has no #app element");
const root = target;

function startLocal(): void {
  mount(App, { target: root });
}

/**
 * Local mode (files and this browser's storage) needs no server and loads
 * no server code. Signed-in mode is a separate chunk, loaded only when the
 * app was served by a Pagework server and the writer hasn't chosen to work
 * without an account on this device.
 */
async function start(): Promise<void> {
  const server = await findServer();
  host.server = server;
  if (server === null || chosenWithoutAccount()) {
    startLocal();
    return;
  }
  const { default: ServerApp } = await import("./server/ServerApp.svelte");
  const app = mount(ServerApp, {
    target: root,
    props: {
      instance: server,
      withoutAccount: () => {
        chooseWithoutAccount(true);
        void unmount(app);
        startLocal();
      },
    },
  });
}

void start();
