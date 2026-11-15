#!/usr/bin/env node
// pagework: command-line tools.
//   pagework export <file.fountain> --template <id> [-o <out.pdf>]
//   pagework parse <file.fountain>
import { readFileSync, realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { formatLineTypes, lineTypes } from "@pagework/fountain";
import { exportPdf } from "./export.ts";

const USAGE = `Usage:
  pagework export <file.fountain> --template <id> [-o <out.pdf>]
  pagework parse <file.fountain>
`;

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

function options(
  args: string[],
): { positional: string[]; flags: Map<string, string> } | string {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (
      arg === "--template" ||
      arg === "-t" ||
      arg === "--output" ||
      arg === "-o"
    ) {
      const value = args[i + 1];
      if (value === undefined) return `${arg} needs a value`;
      flags.set(
        arg.startsWith("--t") || arg === "-t" ? "template" : "output",
        value,
      );
      i++;
    } else if (arg.startsWith("-")) {
      return `Unknown option ${arg}`;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

/** Runs a command and returns the exit code: 0 done, 1 failed, 2 bad usage. */
export async function run(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv;
  const parsed = options(rest);
  if (typeof parsed === "string") {
    io.err(`${parsed}\n\n${USAGE}`);
    return 2;
  }
  const [file] = parsed.positional;
  if (file === undefined || parsed.positional.length > 1) {
    io.err(USAGE);
    return 2;
  }
  try {
    if (command === "parse") {
      io.out(`${formatLineTypes(lineTypes(readFileSync(file, "utf8")))}\n`);
      return 0;
    }
    if (command === "export") {
      const template = parsed.flags.get("template");
      if (template === undefined) {
        io.err(
          `Choose a template with --template, for example --template screenplay-a4.\n\n${USAGE}`,
        );
        return 2;
      }
      const output =
        parsed.flags.get("output") ?? file.replace(/\.[^./\\]*$/, "") + ".pdf";
      const result = await exportPdf(file, template, output);
      if (result.removedMarkers > 0) {
        io.err(
          `Removed ${String(result.removedMarkers)} typed continuation marker(s); Pagework adds its own.\n`,
        );
      }
      if (result.unencodable.length > 0) {
        io.err(
          `These characters can't be shown in the PDF and were printed as "?": ${result.unencodable.join(" ")}\n`,
        );
      }
      io.out(`Exported ${String(result.pages)} page(s) to ${output}\n`);
      return 0;
    }
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  io.err(USAGE);
  return 2;
}

// Run only when started as a program, not when imported by the tests. The
// bin link is a symlink, so compare real paths.
const entry = process.argv[1];
if (
  entry !== undefined &&
  realpathSync(entry) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await run(process.argv.slice(2), {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
}
