# 0010. No generative AI; script content stays on the server

- Status: Accepted
- Date: 2026-11-10

## Context

Many writing tools now include AI generation, rewriting or analysis. Many writers, particularly in film and theatre, do not want tools that write for them, or want their unproduced work sent to outside services. Pagework is built with AI assistance (see README), which makes a clear position on the product itself more important, not less.

One feature creates real pressure here: converting badly formatted scripts (ROADMAP, version 3). Rules handle almost all of it, but a few cases, such as stage directions with no italics or brackets, can only be told apart by meaning.

## Decision

1. **No generative features, ever.** Pagework does not write, rewrite, summarise, critique or give feedback on a writer's text.
2. **Script content stays on the server the user chose.** Pagework never sends script content to an outside service, with the single exception in point 4.
3. **Rules first.** Features that detect structure (such as script conversion) use local code and rules. Where rules can't decide, the writer decides in the review step.
4. **An AI fallback is permitted but not planned.** If evidence later shows it's needed, conversion may gain a fallback that asks an AI model to classify the lines rules couldn't resolve. Any such component:
   - is **disabled by default**, and can only be enabled by the server administrator;
   - asks the writer to **approve each request**, showing exactly which lines will be sent;
   - only classifies structure and never changes the writer's words;
   - connects to an endpoint the administrator configures (a model on their own hardware or a provider of their choice);
   - is **not included in the hosted service** (Pagework by Thorngate) at all;
   - requires its own ADR before it is built.

## Consequences

- A clear promise to writers and organisations: nothing writes for you, and your script doesn't leave your server unless your administrator turned that on and you approved it, line by line.
- Script conversion has to be good without AI. The review step, including bulk corrections, carries the weight for unclear cases.
- Conversion is built with the resolving step as a replaceable component, so a fallback could be added without restructuring. Conversion records, locally and as counts only, how often lines remain unresolved; that is the evidence for or against a fallback.
- Some users will want AI writing features and will choose other tools.

## Alternatives considered

- **No AI under any circumstances:** simplest, but would rule out a narrowly scoped, consented fallback for conversion if rules prove insufficient.
- **A local or cloud AI fallback enabled by default:** convenient, but breaks the promise in point 2 for everyone who never asked for it.
- **AI writing features, off by default:** conflicts with the purpose of the project.
