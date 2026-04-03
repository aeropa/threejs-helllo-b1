import * as THREE from 'three';

// --- GAME SETTINGS & STATE ---
const BOARD_SIZE = 9;
const COLORS = [
    0xff0000, // Red
    0x00ff00, // Green
    0x0000ff, // Blue
    0xffff00, // Yellow
    0x00ffff, // Cyan
    0xff00ff, // Magenta
    0xff8800  // Orange
];

let logicalBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
let visualBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
let selectedCell = null;
let score = 0;

// --- UI SETUP ---
const scoreDiv = document.createElement('div');
scoreDiv.style.position = 'absolute';
scoreDiv.style.top = '20px';
scoreDiv.style.left = '20px';
scoreDiv.style.color = 'white';
scoreDiv.style.fontFamily = 'Arial, sans-serif';
scoreDiv.style.fontSize = '24px';
scoreDiv.style.pointerEvents = 'none';
scoreDiv.innerText = `Score: ${score}`;
document.body.appendChild(scoreDiv);

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// Position camera to look down at an angle over the board
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(4, 9, 10);
camera.lookAt(4, 0, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// Geometries
const tileGeo = new THREE.BoxGeometry(0.95, 0.1, 0.95);
const tileMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
const tileMatSelected = new THREE.MeshStandardMaterial({ color: 0x888888 });
const ballGeo = new THREE.SphereGeometry(0.4, 32, 32);

// Array to hold clickable tiles for Raycasting
const clickableTiles = [];

// --- INITIALIZE BOARD ---
for (let x = 0; x < BOARD_SIZE; x++) {
    for (let z = 0; z < BOARD_SIZE; z++) {
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.position.set(x, 0, z);
        tile.userData = { x, z }; // Store grid coordinates in the mesh
        scene.add(tile);
        clickableTiles.push(tile);
    }
}

// --- GAME LOGIC ---

// Spawn random balls
function spawnBalls(count) {
    let emptyCells = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let z = 0; z < BOARD_SIZE; z++) {
            if (logicalBoard[x][z] === 0) emptyCells.push({ x, z });
        }
    }

    if (emptyCells.length === 0) return false; // Game Over

    // Shuffle and pick
    emptyCells.sort(() => Math.random() - 0.5);
    let spawned = Math.min(count, emptyCells.length);

    for (let i = 0; i < spawned; i++) {
        let { x, z } = emptyCells[i];
        let colorIndex = Math.floor(Math.random() * COLORS.length);
        
        // Logical
        logicalBoard[x][z] = colorIndex + 1; // 1-7 (0 is empty)
        
        // Visual
        let ballMat = new THREE.MeshStandardMaterial({ color: COLORS[colorIndex], roughness: 0.2 });
        let ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.set(x, 0.5, z);
        scene.add(ball);
        visualBoard[x][z] = ball;
    }
    
    return emptyCells.length > count; // Return false if board is completely full
}

// Pathfinding (Breadth-First Search)
function hasPath(startX, startZ, endX, endZ) {
    let queue = [{ x: startX, z: startZ }];
    let visited = new Set([`${startX},${startZ}`]);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]]; // Up, down, left, right

    while (queue.length > 0) {
        let curr = queue.shift();
        if (curr.x === endX && curr.z === endZ) return true;

        for (let [dx, dz] of dirs) {
            let nx = curr.x + dx, nz = curr.z + dz;
            if (nx >= 0 && nx < BOARD_SIZE && nz >= 0 && nz < BOARD_SIZE) {
                if (logicalBoard[nx][nz] === 0 && !visited.has(`${nx},${nz}`)) {
                    visited.add(`${nx},${nz}`);
                    queue.push({ x: nx, z: nz });
                }
            }
        }
    }
    return false;
}

// Check for 5 in a row and clear them
function checkAndClearLines() {
    let toClear = new Set();
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]]; // Right, Down, Diagonal Right, Diagonal Left

    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let z = 0; z < BOARD_SIZE; z++) {
            let color = logicalBoard[x][z];
            if (color === 0) continue;

            for (let [dx, dz] of dirs) {
                let line = [{ x, z }];
                let nx = x + dx, nz = z + dz;

                while (nx >= 0 && nx < BOARD_SIZE && nz >= 0 && nz < BOARD_SIZE && logicalBoard[nx][nz] === color) {
                    line.push({ x: nx, z: nz });
                    nx += dx;
                    nz += dz;
                }

                if (line.length >= 5) {
                    line.forEach(p => toClear.add(`${p.x},${p.z}`));
                }
            }
        }
    }

    if (toClear.size > 0) {
        toClear.forEach(pos => {
            let [x, z] = pos.split(',').map(Number);
            scene.remove(visualBoard[x][z]);
            visualBoard[x][z] = null;
            logicalBoard[x][z] = 0;
        });
        
        // Update Score (Base score + bonus for extra balls)
        score += toClear.size * 2 + (toClear.size - 5) * 5;
        scoreDiv.innerText = `Score: ${score}`;
        return true; // Match found
    }
    return false; // No match found
}

// --- INTERACTION (RAYCASTING) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointerdown', (event) => {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableTiles);

    if (intersects.length > 0) {
        const { x, z } = intersects[0].object.userData;

        if (logicalBoard[x][z] !== 0) {
            // 1. Clicked a ball -> Select it
            selectedCell = { x, z };
        } else if (selectedCell && logicalBoard[x][z] === 0) {
            // 2. Clicked empty space while ball is selected -> Try to move
            if (hasPath(selectedCell.x, selectedCell.z, x, z)) {
                
                // Move logical
                logicalBoard[x][z] = logicalBoard[selectedCell.x][selectedCell.z];
                logicalBoard[selectedCell.x][selectedCell.z] = 0;
                
                // Move visual
                let ball = visualBoard[selectedCell.x][selectedCell.z];
                ball.position.set(x, 0.5, z);
                visualBoard[x][z] = ball;
                visualBoard[selectedCell.x][selectedCell.z] = null;
                
                selectedCell = null; // Deselect

                // Game logic cycle: Check matches -> Spawn if no matches -> Check matches again
                if (!checkAndClearLines()) {
                    if (!spawnBalls(3)) {
                        scoreDiv.innerText = `GAME OVER - Final Score: ${score}`;
                    } else {
                        checkAndClearLines(); // Check if spawning caused a match
                    }
                }
            }
        }
    }
});

// --- RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);

    // Visual feedback: Highlight the tile of the selected ball and make it bounce
    clickableTiles.forEach(tile => tile.material = tileMat);
    if (selectedCell) {
        let index = selectedCell.x * BOARD_SIZE + selectedCell.z;
        clickableTiles[index].material = tileMatSelected;
        
        // Gentle bounce animation
        let ball = visualBoard[selectedCell.x][selectedCell.z];
        if (ball) ball.position.y = 0.5 + Math.abs(Math.sin(Date.now() * 0.005)) * 0.3;
    }
    
    // Ensure unselected balls rest firmly on the board
    for(let x=0; x<BOARD_SIZE; x++){
        for(let z=0; z<BOARD_SIZE; z++){
            if(visualBoard[x][z] && (!selectedCell || selectedCell.x !== x || selectedCell.z !== z)) {
                visualBoard[x][z].position.y = 0.5;
            }
        }
    }

    renderer.render(scene, camera);
}

// Handle Window Resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start game
spawnBalls(5); // Start with 5 balls
animate();