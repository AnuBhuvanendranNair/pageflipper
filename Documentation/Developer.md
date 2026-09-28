# PageFlipper – developer notes

## Architecture

```
Classes/DataProcessing/PageFlipperProcessor.php   data processor "pageflipper"
Resources/Private/Templates/PageFlipper.html      wrapper + grid
Resources/Private/Partials/PageFlipper/
    Item/Covers.html | Tiles.html | Cards.html    one partial per view
    Cover.html                                    cover image / placeholder
    Viewer.html                                   the <dialog>
Resources/Public/JavaScript/
    PageFlipperLoader.js   entry (AssetCollector), event delegation, lazy import
    PageFlipper.js         dialog controller, one instance per content element
      ├── PdfRenderer.js     wraps PDF.js
      └── FlipbookViewer.js  wraps StPageFlip
    Contrib/               bundled third-party libraries
```

- Database: only `tt_content.tx_pageflipper_*` and `sys_file_reference.tx_pageflipper_cover`
  (nested file field for the optional cover). No custom tables.
- The JavaScript only relies on `data-pageflipper-*` attributes, never on CSS classes.
- Only `PdfRenderer.js` and `FlipbookViewer.js` know the libraries. To replace the page-turn
  library, rewrite `FlipbookViewer.js` and keep its public API: `create()`, `setPageImage()`,
  `next()`, `prev()`, `goTo()`, `fit()`, `currentIndex`, `pageCount`, `pageWidth`,
  `visibleIndexes`, `destroy()`.

## Data processor

Options: `references.fieldName`, `cover.width|height|maxWidth|maxHeight|fileExtension|cropVariant`,
`pdfThumbnails`, `as` (default `pageflipper`).

`{pageflipper.items}`: `title`, `description`, `url`, `size`, `file`, `cover`
(`url`, `width`, `height`, `alternative`, `source` = custom|thumbnail), `coverFile`.
`{pageflipper.settings}`: `layout`, `itemPartial`, `showTitles`, `columns`, `pageMode`,
`navigation`, `fullscreen`, `zoom`, `download`, `assetVersion`.

Cover order: custom cover → PDF thumbnail via core image processing → placeholder. A thumbnail
is only used if processing produced a real image (not the PDF itself), so the extension keeps
working without GraphicsMagick/Ghostscript. Missing titles fall back to the file name with
`_`/`-` replaced by spaces.

## Loading and caching

- Initial page load: CSS, `PageFlipperLoader.js` and the cover images only.
- Hover/focus on a trigger preloads the viewer. Opening loads the PDF and renders the visible
  pages plus neighbours (2 before, 3 after). More pages render while flipping.
- Cache busting: the processor passes `assetVersion` (newest mtime of `JavaScript/*.js`) as
  `data-pageflipper-version`. The loader imports modules with `?v=…` and each module forwards
  its own query string to its imports. Without this, changes to lazily imported modules would
  stay cached, because AssetCollector only versions the loader URL.

## Rendering details and workarounds

- **Pages are `<img>` blob URLs (WebP, JPEG fallback), not canvases.** StPageFlip clones page
  nodes while animating, and a cloned `<canvas>` is blank.
- **Oversampling:** bitmaps are rendered at max(devicePixelRatio, 2) (capped at 3 and 2400px).
  A 1:1 bitmap gets resampled by a fractional factor and looks soft on 1x screens.
- **Pixel snapping:** the book width is whole pixels (even for spreads), and its position is
  snapped to device pixels. Half-pixel offsets blur the pages.
- **Single page mode:** StPageFlip has no switch for it. `FlipbookViewer` forces portrait via an
  unreachable `minWidth` and resets the inline min-width it sets.
- **Centered cover:** in spread layout StPageFlip puts a lone cover on the right half (and a lone
  back page on the left). `updateAlignment()` shifts it to the center and removes the shift
  while a page turns.
- **Events during init:** StPageFlip fires `flip` synchronously while initialising. The adapter
  holds callbacks back until construction has finished.
- **Zoom:** a separate scrollable layer with the current page(s) re-rendered by PDF.js.
  StPageFlip has no zoom, and scaling it breaks its pointer math.
- **Fullscreen:** requested on `[data-pageflipper-frame]` inside the dialog. `<dialog>` elements
  can't go fullscreen themselves (Chrome: "Dialog elements are invalid"). The button stays
  hidden where the Fullscreen API is unavailable (e.g. iPhone).
- **Hidden tabs:** StPageFlip animates with `requestAnimationFrame`, so nothing renders in a
  background tab. Keep this in mind for automated browser tests.

## Bundled libraries

| Library | Version | License | Path |
|---|---|---|---|
| pdfjs-dist | 6.3.289, legacy build | Apache-2.0 | `Resources/Public/JavaScript/Contrib/pdfjs` |
| page-flip (StPageFlip) | 2.0.7 | MIT | `Resources/Public/JavaScript/Contrib/page-flip` |

Updating:

```bash
npm pack pdfjs-dist page-flip
```

- pdfjs-dist: copy `legacy/build/pdf.min.mjs` → `pdf.min.js`, `legacy/build/pdf.worker.min.mjs`
  → `pdf.worker.min.js` (renamed so servers without an `.mjs` MIME type still serve them as
  JavaScript), plus `cmaps/`, `standard_fonts/`, `iccs/`, `wasm/` (without `quickjs-*`) and `LICENSE`.
  Then check the `getDocument()` and `page.render()` options in `PdfRenderer.js` against the new
  typings.
- page-flip: copy `dist/js/page-flip.module.js` and `LICENSE`.

## Known limitations

- PDFs are fetched by the browser, so they must be publicly accessible. Non-public FAL storages
  aren't supported.
- Page images are decoded bitmaps. Very large PDFs opened far into the document keep all
  visited pages in memory until the viewer closes.

## Upgrading to TYPO3 v13/v14

- TCA: replace `AbstractFile::FILETYPE_*` with the `FileType` enum.
- Wizard: v13 registers content elements in the wizard from TCA (`group`, `description`);
  `Configuration/page.tsconfig` can then go.
- TypoScript: offer a site set (`Configuration/Sets/PageFlipper/`) next to or instead of the
  static include.
- `ext_tables.sql`: v13 creates most TCA columns automatically. Check which definitions are
  still needed.
- Check `FileCollector` / `FileRepository::findByRelation()` usage in the processor for
  deprecations.
