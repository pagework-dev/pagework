# 0005. Store documents as Yjs from the first version

- Status: Accepted
- Date: 2026-11-10

## Context

Real-time co-writing and offline editing are wanted, but not for version 1. Both need a way to merge edits made in different places. Retrofitting that onto a "save the whole text" model later would mean migrating every stored script and rewriting the save path.

Yjs is a mature CRDT library with a CodeMirror 6 binding, an IndexedDB adapter for offline storage, and a standard sync protocol.

## Decision

From the first version, each script's content is stored as a Yjs document holding a single text type with the Fountain source. On every save the server also writes the plain Fountain text alongside it.

Version 1 sends batched Yjs updates over HTTP. Version 2 adds a WebSocket sync channel and an IndexedDB copy in the browser, with no change to stored data.

## Consequences

- Offline editing and co-writing become additions, not migrations.
- Stored state includes edit history and grows over time; the server compacts it periodically.
- The plain Fountain copy keeps scripts readable and exportable without Yjs, and is what backups, search and export use.
- Adds a dependency of roughly 20 KB compressed to the editor bundle.

## Alternatives considered

- **Save whole text, add merging later:** cheapest now, most expensive later.
- **Operational transformation (ShareDB and similar):** needs a central server for every edit, which conflicts with offline editing.
- **Automerge:** capable, but a larger runtime and a less established CodeMirror integration.
