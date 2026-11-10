# 0002. AGPL-3.0-only, DCO, attribution notice

- Status: Accepted
- Date: 2026-11-10

## Context

Pagework will be self-hosted and may later be offered as a paid hosted service. The maintainer wants the project to stay open, wants credit when it is reused, and wants contributions to be easy.

Plain GPL does not cover software that is only run over a network: someone could host a modified Pagework for others without sharing their changes.

## Decision

- **Licence: GNU AGPL v3.0 only.** Anyone who runs a modified version for users over a network must offer those users its source code.
- **Additional terms under section 7** (stated in `NOTICE`):
  - 7(b): versions made available to users keep a short "Based on Pagework by Connor McMahon and contributors" notice in their About screen or equivalent.
  - 7(e): no rights are granted to the name "Pagework"; modified versions use a different name.
- **Contributions: Developer Certificate of Origin.** Commits are signed off; there is no contributor licence agreement, and contributors keep their copyright.
- **"Only", not "or later":** future licence versions are adopted by a deliberate decision, not automatically.

## Consequences

- The hosted service can run on the same public code: AGPL obliges the operator to share the source, which is already public.
- Because there is no CLA, the project cannot be relicensed or sold under closed terms without every contributor's agreement. That is accepted: there is no plan for closed features.
- Some companies avoid AGPL software. That mostly affects people who would embed Pagework in a closed product, which this licence is meant to prevent.
- The attribution term is deliberately small (text, not a logo) to stay within what section 7(b) allows.

## Alternatives considered

- **GPL-3.0:** leaves the network loophole open.
- **MIT or Apache-2.0:** allows closed, hosted forks and doesn't secure attribution beyond source files.
- **AGPL with a CLA:** keeps a commercial-licence option open, but deters contributors and isn't needed for the current plan.
- **Source-available licences (BSL and similar):** not open source, which conflicts with the project's purpose.
