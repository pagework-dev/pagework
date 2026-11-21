import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, databaseFromUrl, loadConfig } from "../src/config.ts";
import { SECRET } from "./helpers.ts";

const base = {
  PAGEWORK_MODE: "personal",
  PAGEWORK_SECRET: SECRET,
  PAGEWORK_URL: "https://scripts.example.com",
};

describe("configuration", () => {
  it("reads the required settings and fills in defaults", () => {
    const config = loadConfig(base);
    expect(config.mode).toBe("personal");
    expect(config.url.origin).toBe("https://scripts.example.com");
    expect(config.database).toEqual({
      kind: "sqlite",
      file: "/data/pagework.db",
    });
    expect(config.port).toBe(3000);
    expect(config.trustProxy).toBe(false);
  });

  it("lists every problem at once", () => {
    try {
      loadConfig({ PAGEWORK_MODE: "solo", PAGEWORK_SECRET: "short" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as Error).message;
      expect(message).toContain(
        "PAGEWORK_MODE must be personal, team or hosted",
      );
      expect(message).toContain("PAGEWORK_SECRET must be at least 32");
      expect(message).toContain("PAGEWORK_URL is not set");
    }
  });

  it("refuses plain http except on localhost or when allowed", () => {
    expect(() =>
      loadConfig({ ...base, PAGEWORK_URL: "http://scripts.lan" }),
    ).toThrow(/PAGEWORK_INSECURE_HTTP/);
    expect(
      loadConfig({
        ...base,
        PAGEWORK_URL: "http://scripts.lan",
        PAGEWORK_INSECURE_HTTP: "true",
      }).insecureHttp,
    ).toBe(true);
    expect(
      loadConfig({ ...base, PAGEWORK_URL: "http://localhost:3000" }).url.origin,
    ).toBe("http://localhost:3000");
  });

  it("wants the server's address without a path", () => {
    expect(() =>
      loadConfig({ ...base, PAGEWORK_URL: "https://example.com/pagework" }),
    ).toThrow(/no path/);
  });

  it("understands database addresses", () => {
    expect(databaseFromUrl(undefined, "/data")).toEqual({
      kind: "sqlite",
      file: "/data/pagework.db",
    });
    expect(databaseFromUrl("sqlite:///srv/p.db", "/data")).toEqual({
      kind: "sqlite",
      file: "/srv/p.db",
    });
    expect(databaseFromUrl("sqlite:other.db", "/data")).toEqual({
      kind: "sqlite",
      file: "/data/other.db",
    });
    expect(databaseFromUrl("postgres://u:p@db/pagework", "/data").kind).toBe(
      "postgres",
    );
    expect(() => databaseFromUrl("mysql://db", "/data")).toThrow(ConfigError);
  });

  it("documents every variable the server reads", () => {
    const doc = readFileSync(
      new URL("../../../docs/CONFIGURATION.md", import.meta.url),
      "utf8",
    );
    const code = readFileSync(
      new URL("../src/config.ts", import.meta.url),
      "utf8",
    );
    const read = new Set(
      [...code.matchAll(/"((?:PAGEWORK|DATABASE|HOST|PORT)[A-Z_]*)"/g)].map(
        (m) => m[1],
      ),
    );
    expect(read.size).toBeGreaterThan(5);
    for (const name of read) expect(doc, name).toContain(`\`${String(name)}\``);
  });
});
