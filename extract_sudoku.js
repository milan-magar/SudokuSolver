const fs = require('fs');
const path = require('path');
const os = require('os');
const { createCanvas, loadImage } = require('canvas');
const { createWorker } = require('tesseract.js');

async function processSudokuFromScreenshots() {
    const screenshotsDir = path.join(os.homedir(), 'Downloads', 'Screenshots');

    if (!fs.existsSync(screenshotsDir)) {
        console.error(`Folder not found: ${screenshotsDir}`);
        return;
    }

    const files = fs.readdirSync(screenshotsDir).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.png', '.jpg', '.jpeg'].includes(ext);
    });

    if (files.length === 0) {
        console.log(`No images found in: ${screenshotsDir}`);
        return;
    }

    const imagePath = path.join(screenshotsDir, files[0]);
    console.log(`Reading image from: ${imagePath}`);

    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const boardSize = Math.min(canvas.width, canvas.height);
    const cellSize = boardSize / 9;

    let sudokuMatrix = [];
    const worker = await createWorker('eng');
    
    await worker.setParameters({
        tessedit_char_whitelist: '123456789',
        tessedit_pageseg_mode: '10', 
    });

    try {
        console.log("Extracting cells with enhanced 6/9 detection...");

        for (let row = 0; row < 9; row++) {
            let currentRow = [];
            for (let col = 0; col < 9; col++) {
                const x = col * cellSize;
                const y = row * cellSize;

                const padding = cellSize * 0.20;
                const cellX = x + padding;
                const cellY = y + padding;
                const cellW = cellSize - (padding * 2);
                const cellH = cellSize - (padding * 2);

                const cellData = ctx.getImageData(cellX, cellY, cellW, cellH);

                if (isCellEmpty(cellData)) {
                    currentRow.push(0);
                } else {
                    const cellNumber = await recognizeCell(canvas, cellX, cellY, cellW, cellH, worker);
                    currentRow.push(cellNumber);
                }
            }
            sudokuMatrix.push(currentRow);
        }

        console.log("\n--- Final Corrected 9×9 Sudoku Matrix ---");
        console.table(sudokuMatrix);

    } finally {
        await worker.terminate();
    }
}

function isCellEmpty(cellData) {
    let darkPixels = 0;
    const pixels = cellData.data;
    
    for (let i = 0; i < pixels.length; i += 4) {
        const brightness = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
        if (brightness < 130) {
            darkPixels++;
        }
    }
    return darkPixels < 10;
}

async function recognizeCell(parentCanvas, x, y, w, h, worker) {
    const subCanvas = createCanvas(100, 100);
    const subCtx = subCanvas.getContext('2d');
    
    // Clear white fill
    subCtx.fillStyle = '#ffffff';
    subCtx.fillRect(0, 0, 100, 100);
    
    // Draw larger to give 6 and 9 clear loop resolutions
    subCtx.drawImage(parentCanvas, x, y, w, h, 10, 10, 80, 80);

    const { data: { text } } = await worker.recognize(subCanvas.toBuffer());
    let parsed = parseInt(text.trim());
    
    // Fallback rule for 6 and 9: if Tesseract completely fails or returns NaN on a non-empty cell,
    // we analyze the vertical pixel weight distribution to safely distinguish 6 vs 9.
    if (isNaN(parsed)) {
        parsed = analyzeDigitShape(subCtx, 100, 100);
    }
    
    return isNaN(parsed) ? 0 : parsed;
}

// Geometric fallback heuristic specifically for hard-to-read loops (6 vs 9)
function sp(ctx, w, h) {
    const imgData = ctx.getImageData(0, 0, w, h);
    let topDark = 0, bottomDark = 0;
    const mid = Math.floor(h / 2);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const brightness = (imgData.data[idx] + imgData.data[idx+1] + imgData.data[idx+2]) / 3;
            if (brightness < 128) {
                if (y < mid) topDark++;
                else bottomDark++;
            }
        }
    }
    // A '6' typically has a heavier loop at the bottom; a '9' has it at the top.
    // If it's ambiguous, default to a safe value or check ratios.
    return bottomDark > topDark ? 6 : 9;
}

function analyzeDigitShape(ctx, w, h) {
    return sp(ctx, w, h);
}

processSudokuFromScreenshots();