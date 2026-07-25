// background.js
const FOLDER_NAME = 'Screenshots';

// Listen for keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-selection') {
    startSelectionInActiveTab();
  }
});

// Listen for popup messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startSelection') {
    startSelectionInActiveTab();
    sendResponse({ success: true });
    return true;
  }
  if (message.action === 'captureRegion') {
    captureAndCrop(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// --- Start selection overlay ---
async function startSelectionInActiveTab() {
  try {
    const tab = await getCurrentTab();
    if (!tab) throw new Error('No active tab found');

    // Block injection on restricted pages (chrome://, about:, etc.)
    if (isRestrictedUrl(tab.url)) {
      throw new Error('Cannot inject selection overlay on this page (restricted URL).');
    }

    // Inject the selection script and CSS
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['selection.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      css: `
        #ss-overlay { position: fixed; top:0; left:0; width:100%; height:100%; z-index:999999; cursor:crosshair; }
        #ss-rect { position: absolute; border:2px dashed #ff0; background:rgba(255,255,0,0.2); pointer-events:none; display:none; }
        #ss-coords { position: fixed; bottom:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.7); color:#fff; padding:6px 12px; border-radius:4px; font-family:sans-serif; font-size:12px; z-index:9999999; pointer-events:none; }
      `
    });
  } catch (err) {
    console.error('Failed to inject selection script:', err);
    // Notify popup (if open)
    chrome.runtime.sendMessage({ type: 'selectionError', error: err.message }).catch(() => {});
  }
}

// --- Helper: detect restricted URLs ---
function isRestrictedUrl(url) {
  if (!url) return true;
  const restricted = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'about:blank', 'data:'];
  return restricted.some(prefix => url.startsWith(prefix));
}

// --- Capture and crop ---
async function captureAndCrop(region) {
  try {
    const tab = await getCurrentTab();
    if (!tab) throw new Error('No active tab');

    const dataUrl = await captureVisible(tab.id);
    if (!dataUrl) throw new Error('Capture failed');

    const croppedDataUrl = await cropImage(dataUrl, region);

    const timestamp = getTimestamp();
    const filename = `${FOLDER_NAME}/screenshot-${timestamp}.png`;

    await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: croppedDataUrl,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      });
    });

    chrome.runtime.sendMessage({
      type: 'captureResult',
      payload: { success: true, filename, dataUrl: croppedDataUrl }
    }).catch(() => {});

    return { success: true, filename, dataUrl: croppedDataUrl };
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'captureResult',
      payload: { success: false, error: err.message }
    }).catch(() => {});
    throw err;
  }
}

// --- Helpers ---
function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

function captureVisible(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

async function cropImage(dataUrl, region) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    const imgWidth = imageBitmap.width;
    const imgHeight = imageBitmap.height;

    const x = Math.max(0, Math.min(region.x, imgWidth));
    const y = Math.max(0, Math.min(region.y, imgHeight));
    const w = Math.min(region.width, imgWidth - x);
    const h = Math.min(region.height, imgHeight - y);

    if (w <= 0 || h <= 0) {
      throw new Error('Invalid crop region (width or height is zero)');
    }

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, x, y, w, h, 0, 0, w, h);

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read cropped image'));
      reader.readAsDataURL(croppedBlob);
    });
  } catch (err) {
    throw new Error(`Cropping failed: ${err.message}`);
  }
}

function getTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
// ... (keep everything above the captureAndCrop function)

async function captureAndCrop(region) {
  try {
    const tab = await getCurrentTab();
    if (!tab) throw new Error('No active tab');

    const dataUrl = await captureVisible(tab.id);
    if (!dataUrl) throw new Error('Capture failed');

    // Scale the region by the device pixel ratio
    const dpr = region.dpr || 1;
    const scaledRegion = {
      x: region.x * dpr,
      y: region.y * dpr,
      width: region.width * dpr,
      height: region.height * dpr
    };

    const croppedDataUrl = await cropImage(dataUrl, scaledRegion);

    const timestamp = getTimestamp();
    const filename = `${FOLDER_NAME}/screenshot-${timestamp}.png`;

    await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: croppedDataUrl,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      });
    });

    chrome.runtime.sendMessage({
      type: 'captureResult',
      payload: { success: true, filename, dataUrl: croppedDataUrl }
    }).catch(() => {});

    return { success: true, filename, dataUrl: croppedDataUrl };
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'captureResult',
      payload: { success: false, error: err.message }
    }).catch(() => {});
    throw err;
  }
}

// The cropImage function stays the same as before – it now receives scaled coordinates.
async function cropImage(dataUrl, region) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    const imgWidth = imageBitmap.width;
    const imgHeight = imageBitmap.height;

    // Clamp scaled region to image bounds
    const x = Math.max(0, Math.min(region.x, imgWidth));
    const y = Math.max(0, Math.min(region.y, imgHeight));
    const w = Math.min(region.width, imgWidth - x);
    const h = Math.min(region.height, imgHeight - y);

    if (w <= 0 || h <= 0) {
      throw new Error('Invalid crop region (width or height is zero)');
    }

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, x, y, w, h, 0, 0, w, h);

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read cropped image'));
      reader.readAsDataURL(croppedBlob);
    });
  } catch (err) {
    throw new Error(`Cropping failed: ${err.message}`);
  }
}

// ... (keep the rest: getCurrentTab, captureVisible, getTimestamp, isRestrictedUrl, etc.)