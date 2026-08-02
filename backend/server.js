const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const { extractSudoku } = require('./extract');
const { solveAndGetCenters } = require('./math');

const app = express();
const PORT = 3000;

const BASE_DIR = path.join('C:', 'Users', 'user', 'Desktop', 'Sdk');
const SS_DIR = path.join(BASE_DIR, 'ss');
const IMAGE_PATH = path.join(SS_DIR, 'sudoku.png');
const SELECTION_FILE = path.join(SS_DIR, 'selection.json');

let currentSelection = null;

// Load saved selection if exists
if (fs.existsSync(SELECTION_FILE)) {
    try {
        currentSelection = JSON.parse(fs.readFileSync(SELECTION_FILE, 'utf8'));
    } catch(e) {}
}

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/upload', (req, res) => {
    const { image, coordinates } = req.body;
    if (!image) {
        return res.status(400).json({ success: false, error: 'No image data' });
    }
    if (coordinates) {
        currentSelection = coordinates;
        fs.writeFileSync(SELECTION_FILE, JSON.stringify(coordinates));
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFile(IMAGE_PATH, buffer, (err) => {
        if (err) {
            console.error('Error saving image:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, path: IMAGE_PATH });
    });
});

app.get('/image', (req, res) => {
    if (fs.existsSync(IMAGE_PATH)) {
        res.sendFile(IMAGE_PATH);
    } else {
        res.status(404).json({ error: 'Image not found' });
    }
});

app.post('/open-folder', (req, res) => {
    const folder = SS_DIR;
    exec(`start explorer "${folder}"`, (error) => {
        if (error) {
            console.error('Error opening folder:', error);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
});

// Endpoint to extract numbers from the saved image
app.post('/solve', async (req, res) => {
    try {
        if (!fs.existsSync(IMAGE_PATH)) {
            return res.status(404).json({ error: 'No image found. Please capture a Sudoku first.' });
        }
        const extracted = await extractSudoku(IMAGE_PATH);
        res.json({ success: true, extracted });
    } catch (err) {
        console.error('Error processing Sudoku:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint to solve a submitted grid and return centers
app.post('/solve-grid', async (req, res) => {
    const { matrix } = req.body;
    if (!matrix || !Array.isArray(matrix) || matrix.length !== 9) {
        return res.status(400).json({ error: 'Invalid matrix' });
    }
    if (!currentSelection) {
        return res.status(400).json({ error: 'No selection coordinates available. Please capture a Sudoku first.' });
    }

    try {
        const result = solveAndGetCenters(matrix, currentSelection);
        res.json(result);
    } catch (err) {
        console.error('Error solving grid:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Images saved to: ${IMAGE_PATH}`);
});