// content.js - injected into the page
(function() {
  // ========== SELECTION OVERLAY (unchanged) ==========
  let overlay = null;
  let selectionStart = null;
  let selectionEnd = null;
  let isSelecting = false;
  let isActive = false;

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 999999;
      background: rgba(0,0,0,0.3);
      cursor: crosshair;
      pointer-events: all;
    `;
    const rect = document.createElement('div');
    rect.id = 'selection-rect';
    rect.style.cssText = `
      position: fixed;
      border: 2px dashed #ff4444;
      background: rgba(255,68,68,0.1);
      display: none;
      pointer-events: none;
      z-index: 1000000;
    `;
    overlay.appendChild(rect);
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      document.removeEventListener('keydown', onKeyDown);
    }
    selectionStart = null;
    selectionEnd = null;
    isSelecting = false;
    isActive = false;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      removeOverlay();
      chrome.runtime.sendMessage({ action: 'captureCancelled' });
    }
  }

  function getRect() {
    if (!selectionStart || !selectionEnd) return null;
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);
    return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
  }

  function updateRect() {
    const rectEl = overlay ? overlay.querySelector('#selection-rect') : null;
    if (!rectEl) return;
    const rect = getRect();
    if (!rect || rect.width < 2 || rect.height < 2) {
      rectEl.style.display = 'none';
      return;
    }
    rectEl.style.display = 'block';
    rectEl.style.left = rect.left + 'px';
    rectEl.style.top = rect.top + 'px';
    rectEl.style.width = rect.width + 'px';
    rectEl.style.height = rect.height + 'px';
  }

  function onMouseDown(e) {
    if (!isActive) return;
    selectionStart = { x: e.clientX, y: e.clientY };
    selectionEnd = { x: e.clientX, y: e.clientY };
    isSelecting = true;
    updateRect();
  }

  function onMouseMove(e) {
    if (!isSelecting || !selectionStart) return;
    selectionEnd = { x: e.clientX, y: e.clientY };
    updateRect();
  }

  function onMouseUp(e) {
    if (!isSelecting) return;
    isSelecting = false;
    const rect = getRect();
    if (rect && rect.width > 5 && rect.height > 5) {
      captureArea(rect);
    } else {
      removeOverlay();
      chrome.runtime.sendMessage({ action: 'captureCancelled' });
    }
  }

  function captureArea(rect) {
    if (overlay) overlay.style.display = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
          if (response && response.dataUrl) {
            const img = new Image();
            img.onload = function() {
              const dpr = window.devicePixelRatio || 1;
              const canvas = document.createElement('canvas');
              canvas.width = rect.width * dpr;
              canvas.height = rect.height * dpr;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(
                img,
                rect.left * dpr,
                rect.top * dpr,
                rect.width * dpr,
                rect.height * dpr,
                0, 0,
                canvas.width, canvas.height
              );
              const croppedDataUrl = canvas.toDataURL('image/png');
              chrome.runtime.sendMessage({
                action: 'saveImage',
                dataUrl: croppedDataUrl,
                coordinates: rect
              }, (resp) => {
                if (resp && resp.success) {
                  chrome.runtime.sendMessage({ action: 'captureSuccess' });
                } else {
                  chrome.runtime.sendMessage({ action: 'captureFailed' });
                }
                removeOverlay();
              });
            };
            img.src = response.dataUrl;
          } else {
            removeOverlay();
            chrome.runtime.sendMessage({ action: 'captureFailed' });
          }
        });
      });
    });
  }

  // ========== FILL GRID – INPUT STRATEGY (unchanged) ==========
  const DELAY_MS = 150;
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function fillInputElement(element, digit) {
    if (!element) return false;
    const digitStr = String(digit);
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = digitStr;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.focus();
      element.blur();
      return true;
    } else if (element.isContentEditable) {
      element.textContent = digitStr;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillGrid(centers) {
    if (!centers || !Array.isArray(centers) || centers.length === 0) {
      return { success: false, error: 'No centers provided' };
    }

    let filled = 0;
    const failures = [];

    // Try to locate inputs by coordinates
    for (let i = 0; i < centers.length; i++) {
      const { row, col, x, y, digit } = centers[i];
      const el = document.elementFromPoint(x, y);
      let input = null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        input = el;
      } else if (el) {
        input = el.querySelector('input, textarea');
      }
      if (input) {
        const success = fillInputElement(input, digit);
        if (success) {
          filled++;
          console.log(`✅ Input filled (${row},${col})`);
        } else {
          failures.push({ row, col, x, y, digit, error: 'Input fill failed' });
        }
      } else {
        failures.push({ row, col, x, y, digit, error: 'No input found' });
      }
      await sleep(DELAY_MS);
    }

    return { success: true, filled, total: centers.length, failures };
  }

  // ========== MESSAGE LISTENER ==========
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Start selection overlay
    if (message.action === 'startSelection') {
      isActive = true;
      createOverlay();
      sendResponse({ success: true });
      return true;
    }

    // Detect page type
    if (message.action === 'detectPageType') {
      const hasCanvas = document.querySelector('canvas') !== null;
      const hasInputs = document.querySelectorAll('input[type="text"], input:not([type])').length > 5;
      let type = 'unknown';
      if (hasCanvas) type = 'canvas';
      else if (hasInputs) type = 'inputs';
      sendResponse({ type });
      return true;
    }

    // Fill grid (input strategy)
    if (message.action === 'fillGrid') {
      fillGrid(message.centers)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    sendResponse({});
  });

  window.addEventListener('beforeunload', () => {
    removeOverlay();
  });
})();