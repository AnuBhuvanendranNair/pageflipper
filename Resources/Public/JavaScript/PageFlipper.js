/**
 * Viewer controller for one PageFlipper content element.
 *
 *   PageFlipper
 *     ├── PdfRenderer    (PDF.js)
 *     └── FlipbookViewer (StPageFlip)
 *
 * The dialog markup comes from Fluid (Partials/PageFlipper/Viewer.html); this
 * class only looks up elements by their data attributes.
 */
const version = new URL(import.meta.url).search;
const moduleUrl = (path) => new URL(path + version, import.meta.url).href;

const ZOOM_LEVELS = [1, 1.5, 2, 3];
// Pages rendered around the current spread so the next flips are already sharp
const PRERENDER_BEFORE = 2;
const PRERENDER_AFTER = 3;
const MAX_BITMAP_WIDTH = 2400;
const MIN_OVERSAMPLING = 2;
const MAX_OVERSAMPLING = 3;

let dependencies = null;

function loadDependencies() {
  if (!dependencies) {
    dependencies = Promise.all([
      import(moduleUrl('./PdfRenderer.js')),
      import(moduleUrl('./FlipbookViewer.js')),
    ])
      .then(([pdfModule, flipModule]) => ({ pdfModule, flipModule }))
      .catch((error) => {
        dependencies = null;
        throw error;
      });
  }
  return dependencies;
}

/** Loads all viewer libraries without opening anything */
export function preload() {
  return loadDependencies().then(({ pdfModule, flipModule }) =>
    Promise.all([pdfModule.loadPdfJs(), flipModule.loadFlipLibrary()])
  );
}

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

export class PageFlipper {
  /**
   * @param {HTMLElement} root the [data-pageflipper] element of one content element
   */
  constructor(root) {
    this.root = root;
    this.dialog = root.querySelector('[data-pageflipper-viewer]');
    this.pageMode = root.dataset.pageflipperPageMode === 'single' ? 'single' : 'double';

    const find = (selector) => this.dialog.querySelector(selector);
    this.elements = {
      frame: find('[data-pageflipper-frame]') || this.dialog,
      title: find('[data-pageflipper-title]'),
      stage: find('[data-pageflipper-stage]'),
      book: find('[data-pageflipper-book]'),
      zoomLayer: find('[data-pageflipper-zoom-layer]'),
      status: find('[data-pageflipper-status]'),
      pages: find('[data-pageflipper-pages]'),
      live: find('[data-pageflipper-live]'),
      download: find('[data-pageflipper-download]'),
      prev: find('[data-pageflipper-action="prev"]'),
      next: find('[data-pageflipper-action="next"]'),
      zoomIn: find('[data-pageflipper-action="zoom-in"]'),
      zoomOut: find('[data-pageflipper-action="zoom-out"]'),
      fullscreen: find('[data-pageflipper-action="fullscreen"]'),
    };
    this.labels = {
      loading: this.dialog.dataset.labelLoading || 'Loading …',
      error: this.dialog.dataset.labelError || 'The document could not be loaded.',
      page: this.dialog.dataset.labelPage || 'Page %current% of %total%',
    };

    this.session = null;
    this.openCount = 0;
    this.returnFocusTo = null;

    if (this.elements.fullscreen && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
      this.elements.fullscreen.hidden = false;
    }

    this.dialog.addEventListener('click', (event) => this.onClick(event));
    this.dialog.addEventListener('keydown', (event) => this.onKeydown(event));
    this.dialog.addEventListener('close', () => this.teardown());
    document.addEventListener('fullscreenchange', () => this.updateFullscreenState());
    document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenState());
  }

  /**
   * @param {{src: string, title: string, download: string}} item
   * @param {HTMLElement} [trigger] element that receives focus again on close
   */
  async open(item, trigger) {
    if (this.dialog.open) {
      return;
    }
    const openId = ++this.openCount;
    this.returnFocusTo = trigger || document.activeElement;

    this.elements.title.textContent = item.title;
    if (this.elements.download) {
      this.elements.download.hidden = !item.download;
      this.elements.download.href = item.download || '#';
    }
    this.setStatus(this.labels.loading, 'loading');
    this.setPageIndicator('');
    this.setNavigationEnabled(false);

    document.documentElement.classList.add('pageflipper-is-open');
    this.dialog.showModal();

    let pdf = null;
    try {
      const { pdfModule, flipModule } = await loadDependencies();
      pdf = new pdfModule.PdfRenderer();
      await pdf.load(item.src);
      const size = await pdf.getPageSize(1);
      if (openId !== this.openCount || !this.dialog.open) {
        pdf.destroy();
        return;
      }

      const session = {
        pdf,
        book: null,
        urls: new Map(),
        renderedWidth: new Map(),
        queue: [],
        rendering: false,
        zoom: 1,
        zoomRender: 0,
      };
      this.session = session;

      session.book = await flipModule.FlipbookViewer.create(this.elements.book, {
        pageCount: pdf.pageCount,
        pageWidth: size.width,
        pageHeight: size.height,
        mode: this.pageMode,
        pageLabel: (index) => this.pageLabel(String(index + 1), pdf.pageCount),
        onFlip: () => this.onPageChange(session),
        onLayout: () => this.schedulePageRendering(session),
      });
      if (session !== this.session) {
        session.book.destroy();
        return;
      }

      this.setStatus('');
      this.setNavigationEnabled(true);
      this.onPageChange(session);
    } catch (error) {
      if (openId === this.openCount && this.dialog.open) {
        console.error('[PageFlipper]', error);
        this.setStatus(this.labels.error, 'error');
      }
      if (pdf && (!this.session || this.session.pdf !== pdf)) {
        pdf.destroy();
      }
    }
  }

  close() {
    if (this.dialog.open) {
      this.dialog.close();
    }
  }

  teardown() {
    this.openCount++;
    const session = this.session;
    this.session = null;
    if (this.isFullscreen()) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
    }
    if (session) {
      session.queue = [];
      session.book?.destroy();
      session.pdf.destroy();
      session.urls.forEach((url) => URL.revokeObjectURL(url));
    }
    this.elements.book.replaceChildren();
    this.elements.zoomLayer.replaceChildren();
    this.elements.zoomLayer.hidden = true;
    this.dialog.classList.remove('is-zoomed');
    this.updateZoomButtons(1);
    this.elements.live.textContent = '';
    document.documentElement.classList.remove('pageflipper-is-open');

    if (this.returnFocusTo && document.contains(this.returnFocusTo)) {
      this.returnFocusTo.focus();
    }
    this.returnFocusTo = null;
  }

  onClick(event) {
    // Click on the ::backdrop
    if (event.target === this.dialog) {
      this.close();
      return;
    }
    const button = event.target instanceof Element ? event.target.closest('[data-pageflipper-action]') : null;
    if (!button || button.disabled) {
      return;
    }
    switch (button.dataset.pageflipperAction) {
      case 'close':
        this.close();
        break;
      case 'prev':
        this.prev();
        break;
      case 'next':
        this.next();
        break;
      case 'zoom-in':
        this.zoomBy(1);
        break;
      case 'zoom-out':
        this.zoomBy(-1);
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
    }
  }

  onKeydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const handlers = {
      ArrowRight: () => this.next(),
      ArrowLeft: () => this.prev(),
      PageDown: () => this.next(),
      PageUp: () => this.prev(),
      Home: () => this.goTo(0),
      End: () => this.goTo(Infinity),
    };
    if (this.elements.zoomIn) {
      handlers['+'] = () => this.zoomBy(1);
      handlers['-'] = () => this.zoomBy(-1);
    }
    const handler = handlers[event.key];
    if (handler && this.session?.book) {
      event.preventDefault();
      handler();
    }
    // Escape is handled natively by <dialog> (cancel -> close)
  }

  next() {
    const session = this.session;
    if (!session?.book) {
      return;
    }
    if (session.zoom > 1) {
      this.goTo(session.book.visibleIndexes.at(-1) + 1);
    } else {
      session.book.next();
    }
  }

  prev() {
    const session = this.session;
    if (!session?.book) {
      return;
    }
    if (session.zoom > 1) {
      this.goTo(session.book.visibleIndexes[0] - 1);
    } else {
      session.book.prev();
    }
  }

  goTo(index) {
    const book = this.session?.book;
    if (book && index >= 0) {
      book.goTo(Math.min(index, book.pageCount - 1));
    }
  }

  onPageChange(session) {
    if (session !== this.session || !session.book) {
      return;
    }
    const { book } = session;
    const visible = book.visibleIndexes.map((index) => index + 1);
    const current = visible.length > 1 ? `${visible[0]}–${visible[1]}` : String(visible[0]);
    const text = this.pageLabel(current, book.pageCount);
    this.setPageIndicator(text);
    this.elements.live.textContent = text;

    if (this.elements.prev) {
      this.elements.prev.disabled = visible[0] <= 1;
    }
    if (this.elements.next) {
      this.elements.next.disabled = visible.at(-1) >= book.pageCount;
    }

    this.schedulePageRendering(session);
    if (session.zoom > 1) {
      this.renderZoomLayer(session);
    }
  }

  /**
   * Queues the visible pages first, then their neighbours. Pages are rendered one
   * by one and only re-rendered when the book became noticeably larger.
   */
  schedulePageRendering(session) {
    if (session !== this.session || !session.book) {
      return;
    }
    const { book } = session;
    const visible = book.visibleIndexes;
    const first = Math.max(0, visible[0] - PRERENDER_BEFORE);
    const last = Math.min(book.pageCount - 1, visible.at(-1) + PRERENDER_AFTER);
    const wanted = [...visible];
    for (let index = first; index <= last; index++) {
      if (!wanted.includes(index)) {
        wanted.push(index);
      }
    }
    session.queue = wanted;
    this.processQueue(session);
  }

  async processQueue(session) {
    if (session.rendering) {
      return;
    }
    session.rendering = true;
    try {
      while (session === this.session && session.queue.length) {
        const index = session.queue.shift();
        const pixelWidth = this.bitmapWidth(session.book.pageWidth);
        if (!pixelWidth || (session.renderedWidth.get(index) || 0) >= pixelWidth * 0.9) {
          continue;
        }
        const url = await session.pdf.renderToObjectUrl(index + 1, pixelWidth);
        if (session !== this.session) {
          URL.revokeObjectURL(url);
          break;
        }
        const previous = session.urls.get(index);
        session.book.setPageImage(index, url);
        session.urls.set(index, url);
        session.renderedWidth.set(index, pixelWidth);
        if (previous) {
          // Give an in-flight flip animation (which may use a cloned <img>) time to finish
          setTimeout(() => URL.revokeObjectURL(previous), 2000);
        }
      }
    } catch (error) {
      if (session === this.session) {
        console.error('[PageFlipper]', error);
      }
    } finally {
      session.rendering = false;
    }
  }

  /**
   * Pages are rendered with at least 2x oversampling: a 1:1 bitmap gets resampled by a
   * fractional factor to the page size, which visibly softens small text on 1x screens.
   */
  bitmapWidth(cssWidth, zoom = 1) {
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, MIN_OVERSAMPLING), MAX_OVERSAMPLING);
    return Math.min(Math.ceil(cssWidth * zoom * ratio), MAX_BITMAP_WIDTH * zoom);
  }

  zoomBy(step) {
    const session = this.session;
    if (!session?.book || !this.elements.zoomIn) {
      return;
    }
    const position = ZOOM_LEVELS.indexOf(session.zoom) + step;
    const zoom = ZOOM_LEVELS[Math.max(0, Math.min(position, ZOOM_LEVELS.length - 1))];
    if (zoom === session.zoom) {
      return;
    }
    session.zoom = zoom;
    this.updateZoomButtons(zoom);

    const zoomed = zoom > 1;
    this.dialog.classList.toggle('is-zoomed', zoomed);
    this.elements.zoomLayer.hidden = !zoomed;
    if (zoomed) {
      this.renderZoomLayer(session);
    } else {
      session.zoomRender++;
      this.elements.zoomLayer.replaceChildren();
      session.book.fit();
    }
  }

  updateZoomButtons(zoom) {
    if (this.elements.zoomOut) {
      this.elements.zoomOut.disabled = zoom <= ZOOM_LEVELS[0];
    }
    if (this.elements.zoomIn) {
      this.elements.zoomIn.disabled = zoom >= ZOOM_LEVELS.at(-1);
    }
  }

  /**
   * Zoom shows the current page(s) as sharp canvases in a scrollable layer on top
   * of the book, which keeps panning independent from the page-turn library.
   */
  async renderZoomLayer(session) {
    const renderId = ++session.zoomRender;
    const { book, pdf, zoom } = session;
    const cssWidth = book.pageWidth * zoom;
    const layer = this.elements.zoomLayer;
    const canvases = book.visibleIndexes.map((index) => {
      const canvas = document.createElement('canvas');
      canvas.className = 'pageflipper-viewer__zoom-page';
      canvas.style.width = `${Math.round(cssWidth)}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', this.pageLabel(String(index + 1), book.pageCount));
      return { index, canvas };
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'pageflipper-viewer__zoom-spread';
    wrapper.append(...canvases.map(({ canvas }) => canvas));

    try {
      for (const { index, canvas } of canvases) {
        await pdf.renderToCanvas(index + 1, this.bitmapWidth(book.pageWidth, zoom), canvas);
        if (renderId !== session.zoomRender || session !== this.session) {
          return;
        }
      }
      const previousScroll = layer.firstElementChild ? [layer.scrollLeft, layer.scrollTop] : null;
      layer.replaceChildren(wrapper);
      if (previousScroll) {
        [layer.scrollLeft, layer.scrollTop] = previousScroll;
      } else {
        layer.scrollLeft = (layer.scrollWidth - layer.clientWidth) / 2;
      }
    } catch (error) {
      if (session === this.session) {
        console.error('[PageFlipper]', error);
      }
    }
  }

  isFullscreen() {
    const element = fullscreenElement();
    return element !== null && this.dialog.contains(element);
  }

  toggleFullscreen() {
    const frame = this.elements.frame;
    const request = frame.requestFullscreen || frame.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    const result = this.isFullscreen() ? exit?.call(document) : request?.call(frame);
    result?.catch?.((error) => console.warn('[PageFlipper] Fullscreen failed', error));
  }

  updateFullscreenState() {
    if (this.elements.fullscreen) {
      this.elements.fullscreen.setAttribute('aria-pressed', String(this.isFullscreen()));
    }
  }

  setNavigationEnabled(enabled) {
    [this.elements.prev, this.elements.next, this.elements.zoomIn].forEach((button) => {
      if (button) {
        button.disabled = !enabled;
      }
    });
    if (!enabled && this.elements.zoomOut) {
      this.elements.zoomOut.disabled = true;
    }
  }

  setStatus(text, state = '') {
    const status = this.elements.status;
    status.textContent = text;
    status.hidden = text === '';
    status.dataset.state = state;
    this.elements.stage.setAttribute('aria-busy', String(state === 'loading'));
    if (text) {
      this.elements.live.textContent = text;
    }
  }

  setPageIndicator(text) {
    if (this.elements.pages) {
      this.elements.pages.textContent = text;
    }
  }

  pageLabel(current, total) {
    return this.labels.page.replace('%current%', current).replace('%total%', String(total));
  }
}
