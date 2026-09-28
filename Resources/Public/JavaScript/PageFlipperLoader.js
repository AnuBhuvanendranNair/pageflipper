/**
 * PageFlipper entry point.
 *
 * Deliberately tiny: it only wires up the "Open" triggers. The viewer, PDF.js and
 * StPageFlip are loaded on demand when a visitor shows intent to open a flipbook.
 * Every [data-pageflipper] element gets its own, independent viewer instance.
 */
const instances = new WeakMap();
let viewerModule = null;

// The server passes a version covering all viewer modules; the imported modules
// forward the query string of their own URL to everything they import.
function moduleUrl(path) {
  const version = document.querySelector('[data-pageflipper-version]')?.dataset.pageflipperVersion;
  const url = new URL(path, import.meta.url);
  url.search = version ? `v=${encodeURIComponent(version)}` : new URL(import.meta.url).search;
  return url.href;
}

function loadViewerModule() {
  if (!viewerModule) {
    viewerModule = import(moduleUrl('./PageFlipper.js')).catch((error) => {
      viewerModule = null;
      throw error;
    });
  }
  return viewerModule;
}

function findTrigger(event) {
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest('[data-pageflipper-open]');
  return trigger && trigger.closest('[data-pageflipper]') ? trigger : null;
}

async function open(trigger) {
  const root = trigger.closest('[data-pageflipper]');
  trigger.setAttribute('aria-busy', 'true');
  try {
    const { PageFlipper } = await loadViewerModule();
    let instance = instances.get(root);
    if (!instance) {
      instance = new PageFlipper(root);
      instances.set(root, instance);
    }
    instance.open(
      {
        src: trigger.dataset.pageflipperSrc || trigger.getAttribute('href'),
        title: trigger.dataset.pageflipperTitle || '',
        download: trigger.dataset.pageflipperDownload || '',
      },
      trigger
    );
  } catch (error) {
    // Viewer could not be loaded (e.g. offline, blocked module): fall back to the plain PDF
    console.error('[PageFlipper]', error);
    if (trigger.href) {
      window.location.href = trigger.href;
    }
  } finally {
    trigger.removeAttribute('aria-busy');
  }
}

function enhanceTriggers() {
  document.querySelectorAll('[data-pageflipper] [data-pageflipper-open]').forEach((trigger) => {
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'dialog');
  });
}

document.addEventListener('click', (event) => {
  const trigger = findTrigger(event);
  // Keep modified clicks (new tab/window) working as a plain PDF link
  if (!trigger || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  open(trigger);
});

document.addEventListener('keydown', (event) => {
  // Triggers are links with role="button": make Space activate them as well
  if (event.key !== ' ') {
    return;
  }
  const trigger = findTrigger(event);
  if (trigger) {
    event.preventDefault();
    open(trigger);
  }
});

// Warm up the viewer code once a visitor shows intent to open a flipbook
const preload = (event) => {
  if (findTrigger(event)) {
    loadViewerModule().then(({ preload }) => preload?.()).catch(() => {});
  }
};
document.addEventListener('pointerover', preload, { passive: true });
document.addEventListener('focusin', preload);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceTriggers, { once: true });
} else {
  enhanceTriggers();
}
