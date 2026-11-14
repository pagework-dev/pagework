#!/usr/bin/env node
// Debug command: prints each line of a Fountain file next to the element type
// the parser gave it. Usage: pnpm parse <file.fountain>
import { readFileSync } from "node:fs";
import process from "node:process";
import { formatLineTypes, lineTypes } from "@pagework/fountain";

const file = process.argv[2];
if (file === undefined) {
  process.stderr.write("Usage: pnpm parse <file.fountain>\n");
  process.exit(2);
}

let source: string;
try {
  source = readFileSync(file, "utf8");
} catch (error) {
  process.stderr.write(`Could not read ${file}: ${(error as Error).message}\n`);
  process.exit(1);
}

process.stdout.write(`${formatLineTypes(lineTypes(source))}\n`);
