document.addEventListener('DOMContentLoaded', () => {
  // ----- DOM refs (screenshot view) -----
  const selectBtn = document.getElementById('selectAreaBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const openFolderBtn = document.getElementById('openFolderBtn');
  const previewImg = document.getElementById('previewImg');
  const placeholder = document.getElementById('placeholder');
  const statusMsg = document.getElementById('statusMsg');
  const serverDot = document.getElementById('serverDot');
  const serverLabel = document.getElementById('serverLabel');
  const nextBtn = document.getElementById('nextBtn');

  // ----- DOM refs (grid view) -----
  const gridView = document.getElementById('gridView');
  const screenshotView = document.getElementById('screenshotView');
  const sudokuGrid = document.getElementById('sudokuGrid');
  const backBtn = document.getElementById('backBtn');
  const nextPlaceholderBtn = document.getElementById('nextPlaceholderBtn');
  const serverDot2 = document.getElementById('serverDot2');
  const serverLabel2 = document.getElementById('serverLabel2');
  const refreshBtn2 = document.getElementById('refreshBtn2');
  const openFolderBtn2 = document.getElementById('openFolderBtn2');

  let currentMatrix = null;
  let centers = null;
  let isSolved = false;

  // Helper: show status message (screenshot view)
  function showStatus(text, isError = false) {
    statusMsg.textContent = text;
    statusMsg.style.background = isError ? 'rgba(220,50,50,0.9)' : 'rgba(0,0,0,0.72)';
    statusMsg.classList.add('visible');
    clearTimeout(statusMsg._timeout);
    statusMsg._timeout = setTimeout(() => statusMsg.classList.remove('visible'), 3000);
  }

  // ----- Fetch image (screenshot view) -----
  function fetchImage() {
    fetch('http://localhost:3000/image')
      .then(res => {
        if (!res.ok) throw new Error('Image not found');
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        previewImg.src = url;
        previewImg.style.display = 'block';
        placeholder.style.display = 'none';
        showStatus('Image loaded');
      })
      .catch(() => {
        previewImg.style.display = 'none';
        placeholder.style.display = 'block';
        showStatus('No image found on server', true);
      });
  }

  // ----- Server status -----
  function updateServerStatus(online) {
    const dotClass = online ? 'online' : 'offline';
    const label = online ? 'Server: online' : 'Server: offline';
    serverDot.className = `dot ${dotClass}`;
    serverLabel.textContent = label;
    serverDot2.className = `dot ${dotClass}`;
    serverLabel2.textContent = label;
  }

  function checkServer() {
    fetch('http://localhost:3000/health')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(() => updateServerStatus(true))
      .catch(() => updateServerStatus(false));
  }

  // ----- Open folder -----
  function openFolder() {
    chrome.runtime.sendMessage({ action: 'openFolder' });
  }

  // ----- Start area selection -----
  function startCapture() {
    selectBtn.classList.add('loading');
    selectBtn.disabled = true;
    showStatus('Select area on the page…');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: 'startSelection' }, (response) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content.js']
          }, () => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'startSelection' }, handleCaptureResponse);
          });
        } else {
          handleCaptureResponse(response);
        }
      });
    });

    function handleCaptureResponse(response) {
      selectBtn.classList.remove('loading');
      selectBtn.disabled = false;
      if (response && response.success) {
        showStatus('Saved!');
        fetchImage();
      } else {
        showStatus('Capture cancelled or failed', true);
      }
    }
  }

  // ----- Build grid -----
  function buildGrid(matrix) {
    sudokuGrid.innerHTML = '';
    for (let r = 0; r < 9; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < 9; c++) {
        const td = document.createElement('td');
        if ((c + 1) % 3 === 0 && c < 8) td.classList.add('box-border-right');
        if ((r + 1) % 3 === 0 && r < 8) td.classList.add('box-border-bottom');

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 1;
        input.pattern = '[1-9]';
        input.value = matrix[r][c] === 0 ? '' : String(matrix[r][c]);
        input.dataset.row = r;
        input.dataset.col = c;

        input.addEventListener('input', function() {
          const val = this.value;
          if (val === '') {
            matrix[r][c] = 0;
          } else {
            const num = parseInt(val, 10);
            if (isNaN(num) || num < 1 || num > 9) {
              this.value = matrix[r][c] === 0 ? '' : String(matrix[r][c]);
              return;
            }
            matrix[r][c] = num;
            this.value = String(num);
            this.style.color = '';
            this.style.fontWeight = '';
            isSolved = false;
            nextPlaceholderBtn.textContent = 'Next ➔';
            centers = null;
          }
        });

        input.addEventListener('keydown', function(e) {
          const key = e.key;
          if (['Backspace','Delete','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) return;
          if (!/^[1-9]$/.test(key)) e.preventDefault();
        });

        td.appendChild(input);
        tr.appendChild(td);
      }
      sudokuGrid.appendChild(tr);
    }
  }

  // ----- Switch views -----
  function switchToGridView() {
    screenshotView.classList.remove('active');
    gridView.classList.add('active');
  }

  function switchToScreenshotView() {
    gridView.classList.remove('active');
    screenshotView.classList.add('active');
    fetchImage();
    isSolved = false;
    nextPlaceholderBtn.textContent = 'Next ➔';
    centers = null;
  }

  // ----- Handle "Next" from screenshot: extract -----
  async function handleNext() {
    const btn = nextBtn;
    btn.classList.add('loading');
    btn.disabled = true;
    showStatus('Extracting numbers...');

    try {
      const response = await fetch('http://localhost:3000/solve', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Server error');
      if (data.success && data.extracted) {
        currentMatrix = data.extracted;
        buildGrid(currentMatrix);
        switchToGridView();
        isSolved = false;
        nextPlaceholderBtn.textContent = 'Next ➔';
        centers = null;
      } else {
        throw new Error(data.error || 'Extraction failed');
      }
    } catch (err) {
      showStatus('Error: ' + err.message, true);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  // ----- Handle "Next" in grid view: solve or fill -----
  async function handleGridNext() {
    // If already solved, use the Fill action
    if (isSolved && centers && centers.length > 0) {
      await handleFill();
      return;
    }

    // Otherwise, solve the puzzle
    const inputs = document.querySelectorAll('#sudokuGrid input');
    const matrix = Array.from({ length: 9 }, () => Array(9).fill(0));
    inputs.forEach(input => {
      const row = parseInt(input.dataset.row);
      const col = parseInt(input.dataset.col);
      const val = input.value.trim();
      matrix[row][col] = val === '' ? 0 : parseInt(val, 10);
    });

    const btn = nextPlaceholderBtn;
    btn.disabled = true;
    btn.textContent = '⏳ Solving...';

    try {
      const response = await fetch('http://localhost:3000/solve-grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Server error');

      if (data.success) {
        const solved = data.solvedMatrix;
        inputs.forEach(input => {
          const row = parseInt(input.dataset.row);
          const col = parseInt(input.dataset.col);
          if (matrix[row][col] === 0) {
            input.value = solved[row][col];
            input.style.color = '#2d7aff';
            input.style.fontWeight = 'bold';
          }
        });
        centers = data.centers;
        isSolved = true;
        nextPlaceholderBtn.textContent = 'Fill';
        console.log('Centers:', centers);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ----- Fill action (uses debugger or content script) -----
  async function handleFill() {
    if (!centers || centers.length === 0) {
      alert('No blank cells to fill.');
      return;
    }

    const btn = nextPlaceholderBtn;
    btn.disabled = true;
    btn.textContent = '⏳ Filling...';

    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0].id;

      // Detect page type via content script
      let pageType = 'unknown';
      try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'detectPageType' });
        if (response && response.type) pageType = response.type;
      } catch (e) {
        // content script not ready; fallback to generic
        pageType = 'unknown';
      }

      console.log('Page type detected:', pageType);

      let result;
      if (pageType === 'canvas') {
        // Use debugger for canvas
        result = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'fillWithDebugger',
            tabId: tabId,
            centers: centers
          }, (response) => {
            resolve(response);
          });
        });
      } else {
        // Use content script for inputs (or generic)
        result = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, {
            action: 'fillGrid',
            centers: centers
          }, (response) => {
            resolve(response);
          });
        });
      }

      if (result && result.success) {
        btn.textContent = '✅ Filled!';
        setTimeout(() => {
          btn.textContent = 'Fill';
        }, 2000);
      } else {
        alert('Fill failed: ' + (result.error || 'Unknown error'));
        btn.textContent = 'Fill';
      }
    } catch (err) {
      alert('Fill error: ' + err.message);
      btn.textContent = 'Fill';
    } finally {
      btn.disabled = false;
    }
  }

  // ----- Back button -----
  function handleBack() {
    switchToScreenshotView();
  }

  // ----- Event listeners (screenshot view) -----
  selectBtn.addEventListener('click', startCapture);
  refreshBtn.addEventListener('click', () => {
    fetchImage();
    checkServer();
  });
  openFolderBtn.addEventListener('click', openFolder);
  nextBtn.addEventListener('click', handleNext);

  // ----- Event listeners (grid view) -----
  backBtn.addEventListener('click', handleBack);
  nextPlaceholderBtn.addEventListener('click', handleGridNext);
  refreshBtn2.addEventListener('click', () => {
    fetchImage();
    checkServer();
  });
  openFolderBtn2.addEventListener('click', openFolder);

  // ----- Initial load -----
  fetchImage();
  checkServer();
  setInterval(checkServer, 5000);
});