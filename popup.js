// popup.js
(function() {
  'use strict';

  const captureBtn = document.getElementById('captureBtn');
  const previewSection = document.getElementById('previewSection');
  const previewImg = document.getElementById('previewImg');
  const previewFilename = document.getElementById('previewFilename');
  const previewSize = document.getElementById('previewSize');
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');

  let isProcessing = false;

  function setStatus(msg, type) {
    statusEl.className = 'status' + (type ? ' ' + type : '');
    statusText.textContent = msg;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // Check for stored error on load
  chrome.storage.local.get(['lastError'], (result) => {
    if (result.lastError) {
      setStatus('❌ ' + result.lastError, 'error');
      // Clear it after showing
      chrome.storage.local.remove('lastError');
    }
  });

  captureBtn.addEventListener('click', () => {
    if (isProcessing) return;
    chrome.runtime.sendMessage({ action: 'startSelection' }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus('❌ ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      window.close();
    });
  });

  // Listen for background results (when popup is open)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'captureResult') {
      const { success, filename, dataUrl, error } = msg.payload;
      if (success) {
        previewImg.src = dataUrl;
        previewSection.classList.add('has-screenshot');
        const parts = filename.split('/');
        previewFilename.textContent = parts.pop();
        const approxBytes = Math.round((dataUrl.length - 'data:image/png;base64,'.length) * 0.75);
        previewSize.textContent = formatSize(approxBytes);
        setStatus(`✅ Saved to "${parts.join('/')}"`, 'success');
      } else {
        setStatus('❌ ' + (error || 'Capture failed'), 'error');
      }
    }
    if (msg.type === 'selectionError') {
      setStatus('❌ ' + (msg.error || 'Selection error'), 'error');
    }
  });

  setStatus('Ready – click to select area', 'info');
})();