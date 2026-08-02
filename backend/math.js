// math.js - Sudoku solver + center computation
function solveSudoku(board) {
    function isValid(board, row, col, num) {
        for (let c = 0; c < 9; c++) if (board[row][c] === num) return false;
        for (let r = 0; r < 9; r++) if (board[r][col] === num) return false;
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let r = boxRow; r < boxRow + 3; r++) {
            for (let c = boxCol; c < boxCol + 3; c++) {
                if (board[r][c] === num) return false;
            }
        }
        return true;
    }

    function solve(board) {
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (board[row][col] === 0) {
                    for (let num = 1; num <= 9; num++) {
                        if (isValid(board, row, col, num)) {
                            board[row][col] = num;
                            if (solve(board)) return true;
                            board[row][col] = 0;
                        }
                    }
                    return false;
                }
            }
        }
        return true;
    }

    const grid = board.map(row => [...row]);
    if (solve(grid)) return grid;
    return null;
}

function solveAndGetCenters(matrix, selection) {
    const solved = solveSudoku(matrix);
    if (!solved) return { success: false, error: 'No solution' };

    const centers = [];
    const cellWidth = selection.width / 9;
    const cellHeight = selection.height / 9;

    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            if (matrix[row][col] === 0) {
                const x = selection.left + col * cellWidth + cellWidth / 2;
                const y = selection.top + row * cellHeight + cellHeight / 2;
                centers.push({
                    row,
                    col,
                    x,
                    y,
                    digit: solved[row][col]
                });
            }
        }
    }

    return {
        success: true,
        solvedMatrix: solved,
        centers: centers,
        selection: selection
    };
}

module.exports = { solveAndGetCenters };