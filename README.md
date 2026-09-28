# PageFlipper

TYPO3 v12 content element that displays PDFs from FAL as a responsive grid and opens
each one as a page-turning flipbook in an accessible modal viewer.

- PDF rendering with PDF.js, page-turn effect with StPageFlip, both bundled locally
- No Extbase, no jQuery, no CDN
- Viewer code and libraries are loaded only when a visitor opens a flipbook
- Covers: custom image per PDF, server-side PDF thumbnail, or placeholder

## Installation

```bash
composer require anubit/pageflipper
vendor/bin/typo3 extension:setup
```

Include the static TypoScript **PageFlipper** in your site template. The content element
is available in the new content element wizard under "Typical page content".

## Configuration

### Content element

| Option | Default |
|---|---|
| PDF files (sortable; title/description from file metadata, overridable per file) | – |
| Cover image per PDF (optional) | – |
| View: book covers / square tiles / cards | book covers |
| Columns on desktop: 1–4 (fewer on tablet/mobile automatically) | 3 |
| Show file titles | on |
| Page mode: single / double | double |
| Show navigation | on |
| Enable fullscreen | on |
| Enable zoom | on |
| Allow PDF download | on |

### TypoScript constants

```typoscript
plugin.tx_pageflipper {
    view {
        templateRootPath =
        partialRootPath =
        layoutRootPath =
    }
    settings {
        # Include the default CSS (set 0 to style it yourself)
        includeCss = 1
        cssFile = EXT:pageflipper/Resources/Public/Css/pageflipper.css
        # Cover image width in px
        coverWidth = 480
        # Generate cover thumbnails from the first PDF page
        # (needs GraphicsMagick/ImageMagick with Ghostscript and "pdf" in GFX.imagefile_ext)
        pdfThumbnails = 1
    }
}
```

### Templates and styling

Override `Templates/PageFlipper.html` or the partials in `Partials/PageFlipper/` via the
view paths above. The default CSS only uses `.pageflipper*` classes and exposes
custom properties such as `--pageflipper-gap`, `--pageflipper-title-size` and
`--pageflipper-viewer-background`.

## Third-party libraries

Bundled in `Resources/Public/JavaScript/Contrib/`. Each ships with its license file.

| Library | Version | Author | License | Used for |
|---|---|---|---|---|
| [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`, legacy build) | 6.3.289 | Mozilla | Apache-2.0 | Rendering the PDF pages |
| [StPageFlip](https://nodlik.github.io/StPageFlip/) (`page-flip`) | 2.0.7 | Nodlik | MIT | Page-turn effect |

PDF.js also brings its standard fonts (Foxit, Liberation) and WebAssembly image/colour
decoders (OpenJPEG, JBIG2, QCMS) under their own licenses; see `Contrib/pdfjs/standard_fonts/`
and `Contrib/pdfjs/wasm/`.

## Development

Architecture, workarounds, library updates and upgrade notes: [Documentation/Developer.md](Documentation/Developer.md).
