/**
 * Adapter around StPageFlip (page-flip).
 *
 * The rest of PageFlipper only uses this small API (pages as image URLs,
 * next/prev/goTo, a flip callback), so the page-turn library can be replaced
 * without touching templates or the viewer controller.
 */
const version = new URL(import.meta.url).search;
const moduleUrl = (path) => new URL(path + version, import.meta.url).href;

// Below this width per page a "double" book falls back to one page (phones)
const MIN_SPREAD_PAGE_WIDTH = 280;
// StPageFlip has no "always single page" switch; an unreachable minimum width forces portrait mode
const FORCE_PORTRAIT_WIDTH = 100000;

let libraryPromise = null;

const snapToDevicePixel = (value) => {
  const ratio = window.devicePixelRatio || 1;
  return Math.round(value * ratio) / ratio;
};

export function loadFlipLibrary() {
  if (!libraryPromise) {
    libraryPromise = import(moduleUrl('./Contrib/page-flip/page-flip.module.js')).catch((error) => {
      libraryPromise = null;
      throw error;
    });
  }
  return libraryPromise;
}

export class FlipbookViewer {
  /**
   * @param {HTMLElement} container empty element that will hold the book
   * @param {object} options
   * @param {number} options.pageCount
   * @param {number} options.pageWidth  used for the aspect ratio only
   * @param {number} options.pageHeight used for the aspect ratio only
   * @param {'single'|'double'} options.mode
   * @param {(pageIndex: number) => string} [options.pageLabel]
   * @param {(pageIndex: number) => void} [options.onFlip]
   * @param {() => void} [options.onLayout] called when size or orientation changed
   */
  static async create(container, options) {
    const { PageFlip } = await loadFlipLibrary();
    return new FlipbookViewer(PageFlip, container, options);
  }

  constructor(PageFlip, container, options) {
    this.container = container;
    this.options = options;
    this.single = options.mode === 'single';
    this.ratio = options.pageWidth / options.pageHeight;
    this.images = [];
    // StPageFlip fires events synchronously while it initialises; hold them back until we are ready
    this.ready = false;

    this.element = document.createElement('div');
    this.element.className = 'pageflipper-flipbook';
    const pages = [];
    for (let index = 0; index < options.pageCount; index++) {
      const page = document.createElement('div');
      page.className = 'pageflipper-page';
      page.dataset.density = 'soft';
      const image = document.createElement('img');
      image.className = 'pageflipper-page__image';
      image.alt = options.pageLabel ? options.pageLabel(index) : '';
      image.decoding = 'async';
      page.append(image);
      pages.push(page);
      this.images.push(image);
    }
    this.element.append(...pages);
    container.append(this.element);

    const minWidth = this.single ? FORCE_PORTRAIT_WIDTH : MIN_SPREAD_PAGE_WIDTH;
    this.pageFlip = new PageFlip(this.element, {
      width: Math.round(options.pageWidth),
      height: Math.round(options.pageHeight),
      size: 'stretch',
      minWidth,
      maxWidth: Math.max(minWidth, 4000),
      minHeight: 100,
      maxHeight: 4000,
      usePortrait: true,
      showCover: !this.single,
      autoSize: true,
      drawShadow: true,
      maxShadowOpacity: 0.35,
      flippingTime: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 700,
      mobileScrollSupport: false,
      showPageCorners: true,
    });
    this.pageFlip.on('flip', (event) => {
      this.updateAlignment();
      if (this.ready) {
        options.onFlip?.(event.data);
      }
    });
    this.pageFlip.on('changeOrientation', () => {
      this.updateAlignment();
      if (this.ready) {
        options.onLayout?.();
      }
    });
    // While a page turns the full spread is needed; afterwards re-center a lone cover/back page
    this.pageFlip.on('changeState', (event) => {
      if (event.data === 'flipping' || event.data === 'user_fold') {
        this.updateAlignment(true);
      } else if (event.data === 'read') {
        this.updateAlignment();
      }
    });
    this.pageFlip.loadFromHTML(pages);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.fit();
    this.ready = true;
    this.resizeObserver.observe(container);
  }

  /**
   * Limits the book to the space of the container while keeping the page ratio.
   */
  fit() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) {
      return;
    }
    const spreadWidth = Math.min(width, height * this.ratio * 2);
    const useSpread = !this.single && spreadWidth >= MIN_SPREAD_PAGE_WIDTH * 2;
    // Whole pixels, and even for spreads, so both pages start on a whole pixel
    const bookWidth = useSpread
      ? Math.floor(spreadWidth / 2) * 2
      : Math.floor(Math.min(width, height * this.ratio));

    // StPageFlip sets its own min/max width based on the settings; ours win
    this.element.style.minWidth = '0';
    this.element.style.maxWidth = `${Math.floor(bookWidth)}px`;
    this.pageFlip.update();
    this.updateAlignment();
    if (this.ready) {
      this.options.onLayout?.();
    }
  }

  /**
   * In spread layout StPageFlip places a lone cover on the right half and a lone
   * back page on the left half, like a closed book. Shift it to the center instead.
   *
   * @param {boolean} [flipping] true while a page turns: show the spread uncentered
   */
  updateAlignment(flipping = false) {
    let offset = 0;
    if (!flipping && this.isSpread) {
      const index = this.currentIndex;
      if (index === 0) {
        offset = -this.pageWidth / 2;
      } else if (index + 1 >= this.pageCount) {
        offset = this.pageWidth / 2;
      }
    }
    // Snap the book to device pixels: centering can leave it on a half pixel, which blurs the pages
    const container = this.container.getBoundingClientRect();
    const { width, height } = this.element.getBoundingClientRect();
    const left = container.left + (container.width - width) / 2;
    const top = container.top + (container.height - height) / 2;
    const x = snapToDevicePixel(left + offset) - left;
    const y = snapToDevicePixel(top) - top;
    this.element.style.transform = x || y ? `translate(${x}px, ${y}px)` : '';
  }

  setPageImage(index, url) {
    const image = this.images[index];
    if (image) {
      image.src = url;
      image.closest('.pageflipper-page')?.classList.add('is-loaded');
    }
  }

  get pageCount() {
    return this.images.length;
  }

  get currentIndex() {
    return this.pageFlip.getCurrentPageIndex();
  }

  /** Width of one page in CSS pixels */
  get pageWidth() {
    return this.pageFlip.getBoundsRect()?.pageWidth || 0;
  }

  get isSpread() {
    return this.pageFlip.getOrientation() === 'landscape';
  }

  /** Indexes of the pages currently shown (one, or two in a spread) */
  get visibleIndexes() {
    const index = this.currentIndex;
    if (!this.isSpread || index === 0 || index + 1 >= this.pageCount) {
      return [index];
    }
    return [index, index + 1];
  }

  next() {
    this.pageFlip.flipNext();
  }

  prev() {
    this.pageFlip.flipPrev();
  }

  /** Jump without animation */
  goTo(index) {
    this.pageFlip.turnToPage(Math.max(0, Math.min(index, this.pageCount - 1)));
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.pageFlip.destroy();
    this.element.remove();
    this.images = [];
  }
}
