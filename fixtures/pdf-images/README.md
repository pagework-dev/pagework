# Reference page images

The sample script's committed PDFs (`fixtures/sample-script.<template>.pdf`)
rasterised at 50 dpi with poppler:

```sh
pdftoppm -r 50 -png fixtures/sample-script.screenplay-us.pdf fixtures/pdf-images/sample-script.screenplay-us
```

`apps/cli/test/pdf-images.test.ts` renders a fresh export the same way and
fails if more than 0.2% of a page's pixels differ by more than a quarter of
the grey range. Regenerate these only after checking the new PDF by eye, and
say why in the commit.
