// selection.js
(function() {
  'use strict';

  const overlay = document.createElement('div');
  overlay.id = 'ss-overlay';
  const rect = document.createElement('div');
  rect.id = 'ss-rect';
  overlay.appendChild(rect);

  const coordsDisplay = document.createElement('div');
  coordsDisplay.id = 'ss-coords';
  document.body.appendChild(coordsDisplay);

  document.body.appendChild(overlay);

  let startX, startY, isDrawing = false;
  let selection = null;
  const dpr = window.devicePixelRatio || 1;

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = overlay.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    isDrawing = true;
    selection = { x: startX, y: startY, width: 0, height: 0 };
    const r = document.getElementById('ss-rect');
    r.style.display = 'block';
    r.style.left = startX + 'px';
    r.style.top = startY + 'px';
    r.style.width = '0px';
    r.style.height = '0px';
    updateCoords(0, 0);
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const rect = overlay.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    const r = document.getElementById('ss-rect');
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    r.style.width = w + 'px';
    r.style.height = h + 'px';

    selection.x = x;
    selection.y = y;
    selection.width = w;
    selection.height = h;
    updateCoords(w, h);
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    if (selection.width > 5 && selection.height > 5) {
      // 1) Hide overlay and coords
      overlay.style.display = 'none';
      coordsDisplay.style.display = 'none';

      // 2) Wait for the next paint to ensure they are gone
      requestAnimationFrame(() => {
        // 3) Small extra delay for safety (some browsers may need it)
        setTimeout(() => {
          // 4) Now send capture request
          chrome.runtime.sendMessage({
            action: 'captureRegion',
            x: selection.x,
            y: selection.y,
            width: selection.width,
            height: selection.height,
            dpr: dpr
          }, (response) => {
            // 5) Clean up after capture
            cleanup();
          });
        }, 50);
      });
    } else {
      cleanup();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cleanup();
  });

  function updateCoords(w, h) {
    const el = document.getElementById('ss-coords');
    if (el) el.textContent = `${Math.round(w)} × ${Math.round(h)}`;
  }

  function cleanup() {
    const ov = document.getElementById('ss-overlay');
    if (ov) ov.remove();
    const coord = document.getElementById('ss-coords');
    if (coord) coord.remove();
  }

  window.addEventListener('beforeunload', cleanup);
})();