# Script templates

Status: draft specification. The schema is `packages/templates/schema.json`; this document explains it.

A template decides how a script looks on the page: page size, margins, font, how each element is indented and styled, and how pages break. The writing itself is always Fountain; the template only changes rendering. The same script can be switched between templates at any time ([ADR 0007](adr/0007-templates-as-data.md)).

## Where templates live

```
templates/
  base/
    screenplay.yaml      # shared screenplay rules, no page size
    stage.yaml           # shared stage play rules, no page size
  screenplay-us.yaml     # extends base/screenplay, US Letter
  screenplay-a4.yaml     # extends base/screenplay, A4
  stage-us.yaml          # extends base/stage, US Letter
  stage-uk-au.yaml       # extends base/stage, A4
```

Files in `base/` cannot be chosen directly; they exist to be extended. A house format (for example a theatre company's own) is one more file that extends the closest standard template.

## Writing a new template

1. Copy the template closest to what you want, and give it a new file name.
2. Set `extends` to the template you copied, and delete everything you don't want to change.
3. Change only what differs.
4. Run `pnpm templates:preview <file>`. It renders the standard sample script with your template and reloads when you save.
5. Run `pnpm templates:test` to validate against the schema and generate the snapshot for your template.

A typical house template is ten to twenty lines.

## Example

Values below show the structure only. The real values in the built-in templates are checked against reference scripts before release.

```yaml
schema: 1
id: example-house-format
name: Example house format
extends: stage-uk-au

elements:
  character:
    indent: 0mm
    case: upper
    suffix: ":"
  stage_direction:
    style: [italic]
    wrap: parentheses
```

## Fields

### Top level

| Field | Required | Meaning |
|---|---|---|
| `schema` | yes | Schema version. Currently `1`. |
| `id` | yes | Lowercase, hyphenated, unique. Stored with each script. |
| `name` | yes | Shown in the template picker. |
| `extends` | no | ID of the template to inherit from. |
| `kind` | in base templates | `screenplay` or `stage`. Decides which elements exist. |
| `page` | yes, after inheritance | Page size and margins. |
| `font` | yes, after inheritance | Family, size and line height. |
| `elements` | yes, after inheritance | One entry per element type. |
| `pagination` | yes, after inheritance | Page-break rules. |
| `scene_number` | when `pagination.scene_numbers` isn't `none` | Where scene numbers sit. |
| `header`, `footer` | no | Page numbers and running text. |
| `title_page` | no | Layout of the title page fields. |

### Units

Every length carries its unit: `mm`, `in` or `pt`. Bare numbers are rejected, except for counts of lines (`space_before: 1`). This stops A4 and Letter templates being mixed up by accident.

### `page`

```yaml
page:
  size: a4            # a4 | letter | { width: 210mm, height: 297mm }
  margin: { top: 25mm, bottom: 25mm, left: 38mm, right: 25mm }
```

### `font`

```yaml
font:
  family: Courier Prime
  size: 12pt
  line_height: 12pt   # one line; spacing elsewhere is counted in lines
```

### `elements`

Each element type takes:

| Field | Meaning |
|---|---|
| `indent` | Distance from the left margin |
| `width` | Maximum text width; text wraps inside it |
| `align` | `left`, `right` or `center` |
| `case` | `as-written` or `upper` |
| `style` | Any of `bold`, `italic`, `underline` |
| `prefix`, `suffix` | Text added before or after (for example `":"` after a character cue) |
| `wrap` | `parentheses` or `brackets`, if not typed by the writer |
| `space_before` | Blank lines before the element |

Leave out `width` to run the text to the right margin.

Screenplay element types: `scene_heading`, `action`, `character`, `parenthetical`, `dialogue`, `transition`, `centered`, `lyrics`, `dual_dialogue`. All except `dual_dialogue` are required after inheritance.

`dual_dialogue` describes two speeches side by side. It takes `indent`, `width` (the whole area; leave it out to run to the right margin), `gap` (between the two columns) and `space_before`. It also takes `character`, `parenthetical`, `dialogue` and `lyrics`, each with an `indent` and optional `width` measured inside one column:

```yaml
dual_dialogue:
  gap: 0.25in
  character: { indent: 0.8in }
  parenthetical: { indent: 0.3in }
  dialogue: { indent: 0in }
```

Case, style and prefix/suffix inside the columns come from the ordinary element entries.

Stage element types: `act_heading`, `scene_heading`, `stage_direction`, `character`, `parenthetical`, `dialogue`, `lyrics`.

Sections, synopses, notes and boneyard text never appear on the printed page in any template.

### `pagination`

```yaml
pagination:
  dialogue:
    split: true             # allow dialogue to break across pages
    more: "(MORE)"
    continued: "(CONT'D)"
    min_lines_each_side: 2
  character_continued:      # same character speaks again after action
    enabled: true
    text: "(CONT'D)"
  scene_continued:          # CONTINUED: headers in production scripts
    enabled: false
    top: "CONTINUED:"
    bottom: "(CONTINUED)"
  scene_heading:
    keep_with_next: 2       # lines of the following element kept on the same page
  scene_numbers: both       # none | left | right | both
```

All `pagination` fields are required after inheritance; there are no built-in defaults, because a hidden default is a formatting rule no one chose.

Continuation markers are only ever produced here, at render time. They are never stored in a script, and imports remove them ([ADR 0011](adr/0011-continuation-markers-render-only.md)).

### `scene_number`

```yaml
scene_number:
  left: 0.75in    # where the left-hand number starts, from the left edge of the page
  right: 8in      # where the right-hand number ends, from the left edge of the page
```

### `header` and `footer`

```yaml
header:
  offset: 0.5in         # from the top edge (a footer measures from the bottom edge)
  page_number:
    align: right        # left | center | right, within the margins
    format: "{page}."
    from_page: 2        # first script page that shows its number
```

Script pages are numbered from 1. The title page is not counted.

### `title_page`

Title page keys are matched in lower case with spaces as underscores (`Draft date` is `draft_date`). Keys that aren't listed in any area are not printed.

```yaml
title_page:
  title: { case: upper, style: [] }
  center:
    top: 3.5in          # top of the centred block, from the top edge
    fields: [title, credit, author, authors, source]
    space_between: 1    # blank lines between fields
  bottom_left:
    fields: [contact, copyright]   # the block ends at the bottom margin
  bottom_right:
    fields: [draft_date]
```

### Inheritance

`extends` merges the parent template into the child, field by field. Maps are merged; lists and plain values are replaced. Setting a value to `null` removes it. Chains are allowed (`house` → `stage-uk-au` → `base/stage`) but cycles are rejected.

## How stage plays map onto Fountain

Stage templates reuse standard Fountain elements wherever possible: a character cue is still a Fountain character, and dialogue is still dialogue. Stage directions are written as Fountain action lines and rendered by the template's `stage_direction` rules.

Where stage plays need something Fountain does not have (act headings displayed on the page, for example), Pagework will define a small extension. It must degrade to a section, note or boneyard comment in other Fountain apps. These extensions are specified here when the stage templates are built, with an ADR for each one.

## Testing

- Every template is validated against the schema in CI.
- Every template renders `fixtures/sample-script.fountain`. The resulting page model is snapshot-tested, so a change that moves a page break shows up in review.
- The built-in screenplay templates are also checked against reference scripts with known page counts.
