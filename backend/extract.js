const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { createWorker } = require('tesseract.js');

function getSubDir(imagePath) {
    const dir = path.dirname(imagePath);
    const sub = path.join(dir, 'Sub-ss');
    if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    return sub;
}

async function extractSudoku(imagePath) {
    if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const boardSize = Math.min(canvas.width, canvas.height);
    const cellSize = boardSize / 9;
    const subDir = getSubDir(imagePath);

    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const x = col * cellSize;
            const y = row * cellSize;
            const padding = cellSize * 0.20;
            const cellX = x + padding;
            const cellY = y + padding;
            const cellW = cellSize - (padding * 2);
            const cellH = cellSize - (padding * 2);

            const subCanvas = createCanvas(100, 100);
            const subCtx = subCanvas.getContext('2d');
            subCtx.fillStyle = '#ffffff';
            subCtx.fillRect(0, 0, 100, 100);
            subCtx.drawImage(canvas, cellX, cellY, cellW, cellH, 10, 10, 80, 80);

            const filePath = path.join(subDir, `cell_${row}_${col}.png`);
            fs.writeFileSync(filePath, subCanvas.toBuffer('image/png'));
        }
    }

    const cellFiles = fs.readdirSync(subDir).filter(f => f.startsWith('cell_')).sort();
    const worker = await createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: '123456789',
        tessedit_pageseg_mode: '10',
    });

    const matrix = Array.from({ length: 9 }, () => Array(9).fill(0));

    try {
        for (let i = 0; i < cellFiles.length; i++) {
            const filePath = path.join(subDir, cellFiles[i]);
            const cellImage = await loadImage(filePath);
            const cellCanvas = createCanvas(cellImage.width, cellImage.height);
            const cellCtx = cellCanvas.getContext('2d');
            cellCtx.drawImage(cellImage, 0, 0);
            const imgData = cellCtx.getImageData(0, 0, cellCanvas.width, cellCanvas.height);

            // Check if empty (same as original)
            let dark = 0;
            for (let j = 0; j < imgData.data.length; j += 4) {
                const b = (imgData.data[j] + imgData.data[j+1] + imgData.data[j+2]) / 3;
                if (b < 130) dark++;
            }
            const isEmpty = dark < 10;

            let digit = 0;
            if (!isEmpty) {
                const result = await worker.recognize(filePath);
                let parsed = parseInt(result.data.text.trim());
                if (parsed === 6 || parsed === 9 || isNaN(parsed)) {
                    // shape heuristic
                    const shape = analyzeDigitShape(cellCtx, cellCanvas.width, cellCanvas.height);
                    if (shape === 6 || shape === 9) parsed = shape;
                }
                digit = isNaN(parsed) ? 0 : parsed;
            }

            const parts = cellFiles[i].replace('cell_', '').replace('.png', '').split('_').map(Number);
            matrix[parts[0]][parts[1]] = digit;
        }
    } finally {
        await worker.terminate();
    }
    return matrix;
}

function analyzeDigitShape(ctx, w, h) {
    const imgData = ctx.getImageData(0, 0, w, h);
    let top = 0, bottom = 0;
    const mid = Math.floor(h / 2);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const b = (imgData.data[idx] + imgData.data[idx+1] + imgData.data[idx+2]) / 3;
            if (b < 128) {
                if (y < mid) top++;
                else bottom++;
            }
        }
    }
    return bottom > top ? 6 : 9;
}

module.exports = { extractSudoku };