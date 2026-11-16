import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/main.ts";

const root = join(import.meta.dirname, "../../..");
const sample = join(root, "fixtures/sample-script.fountain");
const work = mkdtempSync(join(tmpdir(), "pagework-cli-"));
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

async function cli(
  ...argv: string[]
): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const code = await run(argv, {
    out: (text) => (out += text),
    err: (text) => (err += text),
  });
  return { code, out, err };
}

describe("pagework export", () => {
  it.each(["screenplay-us", "screenplay-a4"])(
    "reproduces the committed sample PDF for %s byte for byte",
    async (template) => {
      const output = join(work, `${template}.pdf`);
      const result = await cli(
        "export",
        sample,
        "--template",
        template,
        "-o",
        output,
      );
      expect(result).toMatchObject({ code: 0, err: "" });
      expect(result.out).toMatch(/^Exported \d+ page\(s\) to /);
      const committed = readFileSync(
        join(root, `fixtures/sample-script.${template}.pdf`),
      );
      expect(readFileSync(output).equals(committed)).toBe(true);
    },
  );

  it("names the PDF after the script when -o is left out", async () => {
    const input = join(work, "short.fountain");
    writeFileSync(input, "INT. HALL - DAY\n\nQuiet.\n");
    expect(
      (await cli("export", input, "--template", "screenplay-a4")).code,
    ).toBe(0);
    expect(
      readFileSync(join(work, "short.pdf")).subarray(0, 5).toString(),
    ).toBe("%PDF-");
  });

  it("removes typed continuation markers and says so", async () => {
    const input = join(work, "typed.fountain");
    writeFileSync(input, "TOM (CONT'D)\nHello.\n(MORE)\n");
    const result = await cli(
      "export",
      input,
      "--template",
      "screenplay-us",
      "-o",
      join(work, "typed.pdf"),
    );
    expect(result.code).toBe(0);
    expect(result.err).toContain("Removed 2 typed continuation marker(s)");
  });

  it("asks for a template", async () => {
    const result = await cli("export", sample);
    expect(result.code).toBe(2);
    expect(result.err).toContain("--template");
  });

  it("lists the templates when the one asked for doesn't exist", async () => {
    const result = await cli(
      "export",
      sample,
      "--template",
      "screenplay-uk",
      "-o",
      join(work, "x.pdf"),
    );
    expect(result.code).toBe(1);
    expect(result.err).toContain("screenplay-a4, screenplay-us");
    expect(result.err).not.toContain("base/screenplay");
  });

  it("reports a missing file", async () => {
    const result = await cli(
      "export",
      join(work, "nowhere.fountain"),
      "--template",
      "screenplay-us",
    );
    expect(result.code).toBe(1);
    expect(result.err).toContain("nowhere.fountain");
  });

  it("rejects unknown options", async () => {
    expect((await cli("export", sample, "--colour", "red")).code).toBe(2);
  });
});

describe("pagework parse", () => {
  it("prints each line with its element type", async () => {
    const result = await cli(
      "parse",
      join(root, "fixtures/fountain/dialogue.fountain"),
    );
    expect(result.code).toBe(0);
    expect(result.out.split("\n")[0]).toBe(" 1  character  | SANBORN");
  });
});
