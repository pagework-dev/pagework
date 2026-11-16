# Parser golden files

Each `.fountain` file has its expected element list beside it as `.json`
(the shape is `Element[]` from `packages/fountain/src/elements.ts`). The test in
`packages/fountain/test/golden.test.ts` parses every input and compares it
with its JSON exactly.

The inputs use the examples in the Fountain 1.1 syntax guide
(<https://fountain.io/syntax>, checked on 16 November 2026), one file per
section of the guide, with straight quotes and "..." as in the guide's
downloadable samples. Where the guide quotes another work (the lyrics example
is a film song), the fixture uses original text with the same structure
instead. Some files add edge cases next to the guide's examples, such as a
heading with no blank line after it.

When changing a fixture, change the JSON by hand and say why in the commit.
Never regenerate the JSON from the parser's output: that would make the test
check the parser against itself.
