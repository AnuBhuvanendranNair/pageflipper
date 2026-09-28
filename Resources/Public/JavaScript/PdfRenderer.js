/**
 * Thin wrapper around Mozilla PDF.js.
 *
 * Nothing outside this module talks to PDF.js directly, so the PDF engine can be
 * swapped or upgraded without touching the viewer.
 */
const version = new URL(import.meta.url).search;
const moduleUrl = (path) => new URL(path + version, import.meta.url).href;
const assetUrl = (path) => new URL(path, import.meta.url).href;

let pdfjsPromise = null;

export function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(moduleUrl('./Contrib/pdfjs/pdf.min.js'))
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = moduleUrl('./Contrib/pdfjs/pdf.worker.min.js');
        return pdfjs;
      })
      .catch((error) => {
        pdfjsPromise = null;
        throw error;
      });
  }
  return pdfjsPromise;
}

let format = null;

/** WebP keeps small text sharper than JPEG at a similar size; Safari cannot encode it */
function imageFormat() {
  if (!format) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    format = canvas.toDataURL('image/webp').startsWith('data:image/webp')
      ? { type: 'image/webp', quality: 0.92 }
      : { type: 'image/jpeg', quality: 0.95 };
  }
  return format;
}

export class PdfRenderer {
  constructor() {
    this.loadingTask = null;
    this.document = null;
    this.renderTasks = new Set();
    this.destroyed = false;
  }

  async load(url) {
    const pdfjs = await loadPdfJs();
    if (this.destroyed) {
      throw new Error('PdfRenderer destroyed');
    }
    this.loadingTask = pdfjs.getDocument({
      url,
      cMapUrl: assetUrl('./Contrib/pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: assetUrl('./Contrib/pdfjs/standard_fonts/'),
      wasmUrl: assetUrl('./Contrib/pdfjs/wasm/'),
      iccUrl: assetUrl('./Contrib/pdfjs/iccs/'),
      isEvalSupported: false,
      enableXfa: false,
    });
    this.document = await this.loadingTask.promise;
    return this;
  }

  get pageCount() {
    return this.document ? this.document.numPages : 0;
  }

  /**
   * Size of a page in PDF units (1/72 inch), useful for the aspect ratio.
   * @param {number} pageNumber 1-based
   */
  async getPageSize(pageNumber = 1) {
    const page = await this.document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  /**
   * @param {number} pageNumber 1-based
   * @param {number} pixelWidth width of the resulting bitmap in device pixels
   * @param {HTMLCanvasElement} [canvas]
   */
  async renderToCanvas(pageNumber, pixelWidth, canvas = document.createElement('canvas')) {
    const page = await this.document.getPage(pageNumber);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.max(pixelWidth, 1) / unscaled.width });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const task = page.render({ canvas, viewport, background: '#ffffff' });
    this.renderTasks.add(task);
    try {
      await task.promise;
    } finally {
      this.renderTasks.delete(task);
    }
    return canvas;
  }

  /**
   * Renders a page into an image blob URL. Images (unlike canvases) survive the
   * DOM cloning some flip libraries do while animating. Revoke the URL when done.
   */
  async renderToObjectUrl(pageNumber, pixelWidth) {
    const { type, quality } = imageFormat();
    const canvas = await this.renderToCanvas(pageNumber, pixelWidth);
    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Canvas export failed'))), type, quality);
      });
      return URL.createObjectURL(blob);
    } finally {
      // Release the bitmap memory right away
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  destroy() {
    this.destroyed = true;
    this.renderTasks.forEach((task) => task.cancel());
    this.renderTasks.clear();
    if (this.loadingTask) {
      this.loadingTask.destroy();
    }
    this.loadingTask = null;
    this.document = null;
  }
}
