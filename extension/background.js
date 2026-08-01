// background.js - service worker
const SERVER_URL = 'http://localhost:3000';

// ========== HELPER: SLEEP ==========
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== CDP COMMAND ==========
function sendCDPCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

// ========== FILL USING DEBUGGER ==========
async function fillUsingDebugger(tabId, centers) {
  // Attach debugger
  try {
    await new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    return { success: false, error: 'Failed to attach debugger: ' + err.message };
  }

  try {
    for (let i = 0; i < centers.length; i++) {
      const { x, y, digit } = centers[i];
      const key = String(digit);
      const keyCode = 48 + digit; // ASCII: '1'=49, ..., '9'=57

      // --- Mouse: move to cell center ---
      await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: x,
        y: y,
        button: 'none'
      });
      await sleep(30);

      // --- Mouse: press left button ---
      await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: x,
        y: y,
        button: 'left',
        clickCount: 1
      });
      await sleep(30);

      // --- Mouse: release left button (click) ---
      await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: x,
        y: y,
        button: 'left',
        clickCount: 1
      });
      await sleep(100);

      // --- Keyboard: keyDown (with text for character) ---
      await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: key,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
        code: `Digit${key}`,
        text: key,               // This sends the actual character
        unmodifiedText: key,
        autoRepeat: false,
        isKeypad: false,
        isSystemKey: false
      });
      await sleep(30);

      // --- Keyboard: keyUp ---
      await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: key,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
        code: `Digit${key}`,
        autoRepeat: false,
        isKeypad: false,
        isSystemKey: false
      });
      await sleep(50);

      console.log(`[${i+1}/${centers.length}] Filled (${Math.round(x)}, ${Math.round(y)}) → ${digit}`);
    }

    // Detach debugger
    await chrome.debugger.detach({ tabId });
    return { success: true, filled: centers.length };

  } catch (err) {
    // Detach on error
    try { await chrome.debugger.detach({ tabId }); } catch (e) {}
    return { success: false, error: err.message };
  }
}

// ========== MESSAGE LISTENER ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ---- capture tab (for screenshot) ----
  if (message.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

  // ---- save image (with coordinates) ----
  if (message.action === 'saveImage') {
    if (!message.dataUrl) {
      sendResponse({ success: false, error: 'No image data' });
      return false;
    }
    const payload = {
      image: message.dataUrl,
      coordinates: message.coordinates || null
    };
    fetch(`${SERVER_URL}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      sendResponse({ success: data.success });
    })
    .catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // ---- open folder ----
  if (message.action === 'openFolder') {
    fetch(`${SERVER_URL}/open-folder`, { method: 'POST' }).catch(() => {});
    sendResponse({});
    return true;
  }

  // ---- fill with debugger ----
  if (message.action === 'fillWithDebugger') {
    const { tabId, centers } = message;
    fillUsingDebugger(tabId, centers)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ---- default ----
  sendResponse({});
  return true;
});