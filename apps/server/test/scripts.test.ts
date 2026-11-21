import { afterEach, describe, expect, it } from "vitest";
import {
  client,
  otherOrg,
  setUp,
  testServer,
  type TestServer,
} from "./helpers.ts";
import { editorDoc } from "./sync-client.ts";

let servers: TestServer[] = [];
afterEach(async () => {
  for (const s of servers) await s.close();
  servers = [];
});

async function ready() {
  const server = await testServer();
  servers.push(server);
  const { owner, view } = await setUp(server);
  return { server, owner, view };
}

interface Script {
  id: string;
  title: string;
  templateId: string;
  projectId: string | null;
  updatedAt: string;
  ownerName: string;
}

async function newScript(
  owner: ReturnType<typeof client>,
  body: Record<string, unknown> = {},
): Promise<Script> {
  const res = await owner.post("/api/scripts", {
    templateId: "screenplay-a4",
    ...body,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Script;
}

async function syncBody(
  server: TestServer,
  owner: ReturnType<typeof client>,
  scriptId: string,
  body: Uint8Array,
) {
  const view = await owner.refresh();
  return server.fetch(`/api/scripts/${scriptId}/sync`, {
    method: "POST",
    headers: {
      cookie: owner.cookie,
      "x-csrf-token": view?.csrfToken ?? "",
      origin: "http://localhost:3000",
      "content-type": "application/octet-stream",
    },
    body: body as Uint8Array<ArrayBuffer>,
  });
}

async function state(owner: ReturnType<typeof client>, scriptId: string) {
  const res = await owner.get(`/api/scripts/${scriptId}/state`);
  expect(res.status).toBe(200);
  return new Uint8Array(await res.arrayBuffer());
}

describe("scripts", () => {
  it("start with none", async () => {
    const { owner } = await ready();
    const res = await owner.get("/api/scripts");
    expect(await res.json()).toEqual({ scripts: [], role: "owner" });
  });

  it("are created empty, untitled unless named, owned by their creator", async () => {
    const { owner } = await ready();
    const script = await newScript(owner);
    expect(script).toMatchObject({
      title: "",
      templateId: "screenplay-a4",
      projectId: null,
      ownerName: "Ada Writer",
    });
    const text = await owner.get(`/api/scripts/${script.id}/fountain`);
    expect(await text.text()).toBe("");
  });

  it("are listed by last edited, newest first", async () => {
    const { server, owner } = await ready();
    const first = await newScript(owner, { title: "First" });
    server.advance(1000);
    await newScript(owner, { title: "Second" });
    server.advance(1000);
    const editor = editorDoc(await state(owner, first.id));
    editor.text.insert(0, "INT. HOUSE - DAY\n");
    expect(
      (await syncBody(server, owner, first.id, editor.body())).status,
    ).toBe(200);
    const list = (await (await owner.get("/api/scripts")).json()) as {
      scripts: Script[];
    };
    expect(list.scripts.map((s) => s.title)).toEqual(["First", "Second"]);
  });

  it("refuse unknown templates and over-long titles", async () => {
    const { owner } = await ready();
    const bad = await owner.post("/api/scripts", { templateId: "sitcom" });
    expect(await bad.json()).toEqual({ error: "unknown_template" });
    const long = await owner.post("/api/scripts", {
      templateId: "screenplay-a4",
      title: "x".repeat(201),
    });
    expect(long.status).toBe(400);
  });

  it("are renamed, given another template, moved, and deleted", async () => {
    const { server, owner } = await ready();
    const script = await newScript(owner);
    const project = (await (
      await owner.post("/api/projects", { name: "Harbour" })
    ).json()) as { id: string };
    const changed = await owner.patch(`/api/scripts/${script.id}`, {
      title: "  The   Lighthouse ",
      templateId: "screenplay-us",
      projectId: project.id,
    });
    expect(await changed.json()).toMatchObject({
      title: "The Lighthouse",
      templateId: "screenplay-us",
      projectId: project.id,
    });
    expect((await owner.del(`/api/scripts/${script.id}`)).status).toBe(200);
    expect((await owner.get(`/api/scripts/${script.id}`)).status).toBe(404);
    const actions = await server.store.db
      .selectFrom("audit_log")
      .select("action")
      .where("target_id", "=", script.id)
      .orderBy("created_at")
      .execute();
    expect(actions.map((a) => a.action)).toEqual([
      "script.created",
      "script.renamed",
      "script.deleted",
    ]);
  });
});

describe("saving", () => {
  it("merges Yjs updates and keeps a plain Fountain copy", async () => {
    const { server, owner } = await ready();
    const script = await newScript(owner);
    const editor = editorDoc(await state(owner, script.id));
    editor.text.insert(0, "INT. LIGHTHOUSE - NIGHT\n\nThe lamp turns.");
    const res = await syncBody(server, owner, script.id, editor.body());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-pagework-version")).toBe("2");
    editor.text.delete(0, 4);
    editor.text.insert(0, "EXT.");
    await syncBody(server, owner, script.id, editor.body());
    const text = await (
      await owner.get(`/api/scripts/${script.id}/fountain`)
    ).text();
    expect(text).toBe("EXT. LIGHTHOUSE - NIGHT\n\nThe lamp turns.");
    // Reloading gives the same text.
    expect(editorDoc(await state(owner, script.id)).text.toJSON()).toBe(text);
  });

  it("brings two tabs together", async () => {
    const { server, owner } = await ready();
    const script = await newScript(owner);
    const start = await state(owner, script.id);
    const a = editorDoc(start);
    const b = editorDoc(start);
    a.text.insert(0, "Tab A writes.");
    a.receive(
      new Uint8Array(
        await (
          await syncBody(server, owner, script.id, a.body())
        ).arrayBuffer(),
      ),
    );
    b.text.insert(0, "Tab B writes. ");
    b.receive(
      new Uint8Array(
        await (
          await syncBody(server, owner, script.id, b.body())
        ).arrayBuffer(),
      ),
    );
    // B got A's change in its answer; A gets B's on its next save.
    a.receive(
      new Uint8Array(
        await (
          await syncBody(server, owner, script.id, a.body())
        ).arrayBuffer(),
      ),
    );
    const stored = await (
      await owner.get(`/api/scripts/${script.id}/fountain`)
    ).text();
    expect(a.text.toJSON()).toBe(stored);
    expect(b.text.toJSON()).toBe(stored);
    expect(stored).toContain("Tab A writes.");
    expect(stored).toContain("Tab B writes.");
  });

  it("refuses something that isn't a Yjs update", async () => {
    const { server, owner } = await ready();
    const script = await newScript(owner);
    const garbage = new Uint8Array([0, 0, 0, 5, 1, 2, 3, 4, 5]);
    const res = await syncBody(server, owner, script.id, garbage);
    expect(res.status).toBe(400);
    const short = await syncBody(server, owner, script.id, new Uint8Array([1]));
    expect(short.status).toBe(400);
  });

  it("needs the CSRF token", async () => {
    const { server, owner } = await ready();
    const script = await newScript(owner);
    const editor = editorDoc(await state(owner, script.id));
    editor.text.insert(0, "x");
    const res = await server.fetch(`/api/scripts/${script.id}/sync`, {
      method: "POST",
      headers: { cookie: owner.cookie, origin: "http://localhost:3000" },
      body: editor.body() as Uint8Array<ArrayBuffer>,
    });
    expect(res.status).toBe(403);
  });
});

describe("projects", () => {
  it("are created, listed by name, renamed and deleted without losing scripts", async () => {
    const { owner } = await ready();
    const b = (await (
      await owner.post("/api/projects", { name: "Series two" })
    ).json()) as { id: string };
    await owner.post("/api/projects", { name: "Feature" });
    const list = (await (await owner.get("/api/projects")).json()) as {
      projects: { name: string }[];
    };
    expect(list.projects.map((p) => p.name)).toEqual(["Feature", "Series two"]);
    const script = await newScript(owner, { projectId: b.id });
    expect(
      (await owner.patch(`/api/projects/${b.id}`, { name: "Season 2" })).status,
    ).toBe(200);
    expect((await owner.del(`/api/projects/${b.id}`)).status).toBe(200);
    const after = (await (
      await owner.get(`/api/scripts/${script.id}`)
    ).json()) as Script;
    expect(after.projectId).toBeNull();
  });

  it("must be named", async () => {
    const { owner } = await ready();
    expect((await owner.post("/api/projects", { name: " " })).status).toBe(400);
  });
});

describe("roles", () => {
  it("let readers read but not write", async () => {
    const { server, owner, view } = await ready();
    const script = await newScript(owner, { title: "Shared" });
    const { person } = await otherOrg(server, "reader", {
      orgId: view.org?.id ?? "",
    });
    expect((await person.get("/api/scripts")).status).toBe(200);
    expect((await person.get(`/api/scripts/${script.id}/state`)).status).toBe(
      200,
    );
    for (const res of [
      await person.post("/api/scripts", { templateId: "screenplay-a4" }),
      await person.patch(`/api/scripts/${script.id}`, { title: "Mine" }),
      await person.del(`/api/scripts/${script.id}`),
      await person.post("/api/projects", { name: "P" }),
      await syncBody(server, person, script.id, editorDoc().body()),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "not_allowed" });
    }
  });

  it("let writers write", async () => {
    const { server, owner, view } = await ready();
    const script = await newScript(owner);
    const { person } = await otherOrg(server, "writer", {
      orgId: view.org?.id ?? "",
    });
    expect(
      (await person.patch(`/api/scripts/${script.id}`, { title: "Ours" }))
        .status,
    ).toBe(200);
  });
});

describe("organisation isolation", () => {
  it("no route reads or changes another organisation's scripts or projects", async () => {
    const { server, owner } = await ready();
    const script = await newScript(owner, { title: "Private" });
    const project = (await (
      await owner.post("/api/projects", { name: "Mine" })
    ).json()) as { id: string };
    const { person } = await otherOrg(server, "owner");

    const list = (await (await person.get("/api/scripts")).json()) as {
      scripts: unknown[];
    };
    expect(list.scripts).toEqual([]);
    const projects = (await (await person.get("/api/projects")).json()) as {
      projects: unknown[];
    };
    expect(projects.projects).toEqual([]);

    const attempts = [
      await person.get(`/api/scripts/${script.id}`),
      await person.get(`/api/scripts/${script.id}/state`),
      await person.get(`/api/scripts/${script.id}/fountain`),
      await person.patch(`/api/scripts/${script.id}`, { title: "Stolen" }),
      await person.del(`/api/scripts/${script.id}`),
      await syncBody(server, person, script.id, editorDoc().body()),
      await person.patch(`/api/projects/${project.id}`, { name: "Stolen" }),
      await person.del(`/api/projects/${project.id}`),
    ];
    for (const res of attempts) expect(res.status).toBe(404);
    // Putting one's own script into another organisation's project fails too.
    const mine = await newScript(person);
    const move = await person.patch(`/api/scripts/${mine.id}`, {
      projectId: project.id,
    });
    expect(await move.json()).toEqual({ error: "unknown_project" });

    const untouched = (await (
      await owner.get(`/api/scripts/${script.id}`)
    ).json()) as Script;
    expect(untouched.title).toBe("Private");
    expect(
      await (await owner.get(`/api/scripts/${script.id}/fountain`)).text(),
    ).toBe("");
  });

  it("rejects ids that aren't ids", async () => {
    const { owner } = await ready();
    expect((await owner.get("/api/scripts/../../users")).status).toBe(404);
    expect((await owner.get("/api/scripts/1%20OR%201=1")).status).toBe(400);
  });
});
