# Design

The interface contract for Pagework. Every visible decision here has a reason; anything not covered follows the same reasoning. Changes to this file are made deliberately, in their own pull request.

## Subject

- **Product:** a script editor. The main job of the main screen is writing and reading a script page by page.
- **Audience:** screenwriters and playwrights, from students and community theatre to working professionals. Long sessions at a desk; also tablets with keyboards, and phones for reading and notes. Often late at night.
- **Genre:** two, layered.
  1. **The script page.** The industry-standard manuscript: white paper, Courier 12 pt, fixed margins, one page roughly one minute of screen time. Writers read this format fluently and judge software by how faithfully it reproduces it.
  2. **The document app.** A word processor or PDF viewer: the page sits on a neutral desk, with a navigator to one side and a toolbar above. Writers already know where things are in Final Draft, Word and Preview.
- **Real artefacts drawn on:** the printed screenplay and stage play page; production revision paper colours (white, blue, pink, yellow, green, goldenrod, buff, salmon, cherry); index cards on a corkboard; the script binder.

## Anchor per screen

| Screen | Anchor |
|---|---|
| Script editor | The page. Everything else is quiet chrome. |
| Script list | The list of scripts, sorted by last edited |
| Index cards | The cards, in scene order |
| Snapshot comparison | The two texts and their differences |
| Users (admin console) | The user table; the selected user's detail pane opens beside it |
| Settings | The form |

The app opens to the script list. There is no landing page, dashboard or welcome tour inside the app.

## Palette

True greys: this is a native-feeling document tool, and the page must read as white paper. Colour is reserved for meaning.

| Role | Token | Value | Reason |
|---|---|---|---|
| Text | `--text` | `#1A1A1A` | Near-black, like printed ink; 17.4:1 on white |
| Muted text | `--text-muted` | `#595959` | Secondary labels; 7.0:1 on white, 5.6:1 on the desk |
| Page | `--page` | `#FFFFFF` | Script paper is white |
| Surface | `--surface` | `#FFFFFF` | Panels and lists |
| Chrome | `--chrome` | `#F2F2F2` | Toolbar, sidebar, status bar |
| Desk | `--desk` | `#E6E6E6` | Behind the page, as in a PDF viewer; makes the page edge visible |
| Border | `--border` | `#D0D0D0` | Decorative separators only (1.54:1) |
| Control border | `--border-control` | `#8A8A8A` | Input boundaries; 3.45:1 on white |
| Action | `--action` | `#1F5FA8` | Primary button, focus ring, selected item, links. White on it is 6.44:1 |
| Selection | `--selection` | `#E3ECF7` | Selected rows and cards; muted text on it is 5.87:1 |
| Error | `--state-error` | `#A4262C` | 7.26:1 on white |
| Warning | `--state-warning` | `#7A4100` | 8.13:1 on white |

**Why this action colour.** It has to stay clearly separate from the nine revision paper tints (V2 uses those as real data), so it is dark and saturated where they are pale. It sits near the platform accent blues writers already read as "interactive". It is used only for the roles listed above, never for headings, icons or decoration.

**Revision colours** are data, not decoration. In V2 they mark revised pages, using the industry order. They appear as page tints and labels, and are always paired with the revision name in text.

**Dark mode.** Writers work at night, so dark mode is in scope: dark chrome and desk, with the page staying paper-white by default. A separate "dark page" option inverts the page for writers who want it. Dark values are defined when the first screen is built, and every pair is contrast-checked before merging.

## Type

| Role | Family | Reason |
|---|---|---|
| Interface | System stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | A native document tool should feel like the writer's own platform. No web-font download on a low-end device. |
| Script page | Courier Prime (SIL Open Font Licence), self-hosted, regular/bold/italic/bold italic | The page format requires a 12 pt Courier. Courier Prime is metrically matched to Courier, legible on screen, and free to embed in PDFs. |
| Figures | Interface font with `tabular-nums` | Page counts, scene numbers and timings line up |

Scale: 13 / 14 / 16 / 20 px, ratio about 1.15. Body 14 px, weight 400. Headings 600. Sentence case everywhere. On the page, sizes come from the template, never from this scale.

## Density

- **Standard tier** (desktop, keyboard and mouse): 14 px text, 20 px line, 32 px controls, 8 px spacing base.
- **Touch** (coarse pointer): the same layout with 44 px targets and 16 px inputs, so iOS doesn't zoom on focus.

One tier per input type. The editor never mixes big display headings with compact tables.

## Layout

- **Editor:** script navigator (scenes) on the left, page in the centre on the desk, comments/notes panel on the right (hidden until needed). Toolbar above, status bar below with page count, scene and save state.
- **Narrow screens:** navigator and comments become sheets. Phones default to reflow view (formatted, not paginated, page breaks as markers); tablets default to page view.
- **Element bar:** on touch devices, a row of element buttons sits above the on-screen keyboard.
- **Current element** is always visible: in the toolbar's element picker, and in the status bar.
- Chrome dimensions stay fixed between screens.

## Writing behaviour

The editor works like the screenwriting software writers already use. Fountain syntax is never required and is hidden unless "Show Fountain" is on (see ARCHITECTURE.md, Editing behaviour).

### Keyboard flow (screenplay templates)

| In this element | Enter goes to | Tab changes it to | Enter on an empty line |
|---|---|---|---|
| Scene heading | Action | Action | Changes it to action |
| Action | Action | Character | Changes it to scene heading |
| Character | Dialogue | Transition | Changes it to action |
| Parenthetical | Dialogue | Dialogue | Changes it to dialogue |
| Dialogue | Character | Parenthetical | Changes it to action |
| Transition | Scene heading | Scene heading | Changes it to action |

Stage templates get their own table when they are built, following the same pattern. Shift+Tab reverses Tab. Every element can also be set directly with Ctrl/Cmd+1 to 7, shown in the element picker.

### Autocomplete

- Character cues: names already used, most recent first. Typing a character's initial and Enter picks the top match.
- Scene headings: INT., EXT., INT./EXT., then locations already used, then times of day.
- Transitions: those already used, plus CUT TO:, DISSOLVE TO:, FADE OUT.
- Suggestions appear inline and are accepted with Enter or Tab; they never insert text the writer didn't accept.

### What the writer sees

- Text formatted exactly as the template prints it: indents, capitals, spacing, page breaks, (MORE) and (CONT'D).
- Scene numbers in the margins when the template shows them.
- Notes and boneyard text as dimmed, collapsible margin notes, never inline clutter.
- Nothing from Fountain's syntax, unless the writer turns on "Show Fountain".

## Motion

Motion only answers an action.

- Press feedback: 100 ms. Hover and selection: 150 ms. Panels and sheets: 220 ms in, about 150 ms out.
- Index card drag follows the pointer with no easing.
- Nothing moves on its own. No loading shimmer, no pulsing save indicator. `prefers-reduced-motion` turns transitions off.

## States

Every screen designs these, not just the happy path:

- **Empty:** "No scripts yet." with one button: "New script". An empty script shows a blinking cursor on page one, nothing else.
- **Loading:** nothing for the first 300 ms, then page outlines in the real page size.
- **Saving:** status bar text: "Saved", "Saving…", "Not saved: offline". Words, not icons.
- **Offline / server down:** a bar under the toolbar saying what happened and that typing is kept locally (V2), or that editing is paused (V1). Never a blank screen.
- **Errors:** what went wrong and what to do, in plain words. No apology, no error codes without explanation.
- **Long content:** 300-page scripts, 60-character titles, characters with long names.

## Copy

- Buttons name the action: "New script", "Export PDF", "Take snapshot", "Invite writer".
- Industry terms where writers use them: scene heading, action, character, dialogue, parenthetical, transition. Developer terms ("document", "entity", "sync") don't appear in the interface.
- No marketing language anywhere in the app.

## Deliberate overrides

These would normally read as generated-UI tells. Each is earned here:

| Trait | Why it's right for Pagework |
|---|---|
| System UI font as the only interface face | Native document-tool genre; performance on low-end devices |
| Monospace for non-code text | The script page format is defined in Courier |
| A shadow on a resting element | The page is a sheet lying on the desk; it is the only resting element with a shadow |
| Numbered items (scene numbers) | They are a real sequence used in production |

## Refused defaults

Considered and rejected:

- A dark, near-black theme with one bright accent as the default look
- A cream or "paper-tone" background (the industry page is white)
- Serif display headings, tracked all-caps labels, eyebrows above headings
- A marketing hero, feature cards or stats inside the app
- Typewriter costume: paper texture, ribbon ink, keystroke sounds
- Coloured stripes on cards to show state (index cards use real card colours chosen by the writer, which is data)

## Checks before merging UI work

- Contrast: every text pair at least 4.5:1, control borders and focus at least 3:1, in light and dark.
- 375 px, 768 px and 1280 px wide; keyboard only; iPad Safari with the on-screen keyboard open.
- The generic-UI self-audit (tokens only, no raw hex in components; no infinite animation; sentence case; copy names actions).
- Empty, loading, error and offline states present.

## Looks log

| Date | Product | Background | Accent | Display face | Layout | Hero |
|---|---|---|---|---|---|---|
| 2026-11-10 | Pagework | White page on grey desk | Blue `#1F5FA8`, actions only | System UI; Courier Prime on the page | Navigator / page / notes | None (opens to script list) |
