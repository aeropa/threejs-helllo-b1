import * as THREE from 'three';
// Import OrbitControls from the Three.js add-ons folder
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- MOBILE BROWSER PROTECTIONS ---
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.touchAction = 'none'; 
document.body.style.backgroundColor = '#111';
document.body.style.userSelect = 'none';
document.body.style.webkitUserSelect = 'none';

// --- GAME SETTINGS & STATE ---
const BOARD_SIZE = 9;
const COLORS = [
    0xff0000, 0x00ff00, 0x0088ff, 0xffff00, 
    0x00ffff, 0xff00ff, 0xff8800
];

let logicalBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
let visualBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
let selectedCell = null;
let score = 0;
let isAnimating = false; // Prevents clicking while a ball is moving

// --- UI SETUP ---
const uiContainer = document.createElement('div');
uiContainer.style.position = 'absolute';
uiContainer.style.top = '10px';
uiContainer.style.width = '100%';
uiContainer.style.display = 'flex';
uiContainer.style.flexDirection = 'column';
uiContainer.style.alignItems = 'center';
uiContainer.style.gap = '10px';
uiContainer.style.pointerEvents = 'none';
uiContainer.style.fontFamily = 'Arial, sans-serif';
document.body.appendChild(uiContainer);

const scoreDiv = document.createElement('div');
scoreDiv.style.color = 'white';
scoreDiv.style.fontSize = '32px';
scoreDiv.style.fontWeight = 'bold';
scoreDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
scoreDiv.innerText = `Score: ${score}`;
uiContainer.appendChild(scoreDiv);

// Lock Checkbox UI
const lockContainer = document.createElement('label');
lockContainer.style.pointerEvents = 'auto'; // Allow clicking the checkbox
lockContainer.style.color = '#f0f0f0';
lockContainer.style.fontSize = '18px';
lockContainer.style.display = 'flex';
lockContainer.style.alignItems = 'center';
lockContainer.style.gap = '8px';
lockContainer.style.background = 'rgba(0,0,0,0.5)';
lockContainer.style.padding = '8px 16px';
lockContainer.style.borderRadius = '20px';
lockContainer.innerHTML = `<input type="checkbox" id="cameraLock" checked style="transform: scale(1.5);"> Lock Camera`;
uiContainer.appendChild(lockContainer);

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Setup Orbit Controls (Zooming / Panning)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(4, 0, 4); // Set focus to center of the 9x9 board
controls.enableDamping = true;
controls.maxDistance = 25; // Max zoom out
controls.minDistance = 3;  // Max zoom in
controls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't let camera go below ground
controls.enabled = false; // Start locked (because checkbox is checked)

// Listen to Lock Checkbox
document.getElementById('cameraLock').addEventListener('change', (e) => {
    controls.enabled = !e.target.checked;
});

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 15, 5);
scene.add(dirLight);

// Geometries
const tileGeo = new THREE.BoxGeometry(0.95, 0.1, 0.95);
const tileMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
const tileMatSelected = new THREE.MeshStandardMaterial({ color: 0x666666 });
const ballGeo = new THREE.SphereGeometry(0.4, 32, 32);

const clickableTiles = [];

// --- INITIALIZE BOARD & NEON GRID ---
for (let x = 0; x < BOARD_SIZE; x++) {
    for (let z = 0; z < BOARD_SIZE; z++) {
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.position.set(x, 0, z);
        tile.userData = { x, z };
        scene.add(tile);
        clickableTiles.push(tile);
    }
}

// Add bright cyan grid lines!
// 9x9 grid, sized 9 units, cyan color
const gridHelper = new THREE.GridHelper(BOARD_SIZE, BOARD_SIZE, 0x808080, 0x808080);
gridHelper.position.set(4, 0.06, 4); // Place slightly above the tile surfaces
scene.add(gridHelper);

// --- DYNAMIC CAMERA FRAMING ---
function updateCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    if (aspect < 1) {
        camera.position.set(4, 13 + (1 / aspect) * 2, 9); // Portrait
    } else {
        camera.position.set(4, 9, 8); // Landscape
    }
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    controls.update();
}
window.addEventListener('resize', updateCamera);
updateCamera();

// --- GAME LOGIC ---

function spawnBalls(count) {
    let emptyCells = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let z = 0; z < BOARD_SIZE; z++) {
            if (logicalBoard[x][z] === 0) emptyCells.push({ x, z });
        }
    }

    if (emptyCells.length === 0) return false;

    emptyCells.sort(() => Math.random() - 0.5);
    let spawned = Math.min(count, emptyCells.length);

    for (let i = 0; i < spawned; i++) {
        let { x, z } = emptyCells[i];
        let colorIndex = Math.floor(Math.random() * COLORS.length);
        logicalBoard[x][z] = colorIndex + 1;
        
        let ballMat = new THREE.MeshStandardMaterial({ color: COLORS[colorIndex], roughness: 0.1, metalness: 0.3 });
        let ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.set(x, 0.5, z);
        ball.scale.set(0, 0, 0); // Start tiny for pop-in animation
        scene.add(ball);
        visualBoard[x][z] = ball;
    }
    return emptyCells.length > count;
}

// NEW: BFS that returns the actual array of coordinates for the path
function findPath(startX, startZ, endX, endZ) {
    let queue = [{ x: startX, z: startZ, path: [] }];
    let visited = new Set([`${startX},${startZ}`]);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    while (queue.length > 0) {
        let { x, z, path } = queue.shift();
        
        if (x === endX && z === endZ) return path;

        for (let [dx, dz] of dirs) {
            let nx = x + dx, nz = z + dz;
            if (nx >= 0 && nx < BOARD_SIZE && nz >= 0 && nz < BOARD_SIZE) {
                if (logicalBoard[nx][nz] === 0 && !visited.has(`${nx},${nz}`)) {
                    visited.add(`${nx},${nz}`);
                    queue.push({ x: nx, z: nz, path: [...path, { x: nx, z: nz }] });
                }
            }
        }
    }
    return null; // No path found
}

function checkAndClearLines() {
    let toClear = new Set();
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];

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
        score += toClear.size * 2 + (toClear.size - 5) * 5;
        scoreDiv.innerText = `Score: ${score}`;
        return true;
    }
    return false;
}

// --- ANIMATION SYSTEM ---
function animateBallAlongPath(ball, path, onComplete) {
    let step = 0;
    const speed = 0.25; // The higher, the faster the ball moves

    function moveFrame() {
        if (step >= path.length) {
            onComplete();
            return;
        }

        let target = path[step];
        let dx = target.x - ball.position.x;
        let dz = target.z - ball.position.z;
        let distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < speed) {
            // Snap to grid point and target next step
            ball.position.x = target.x;
            ball.position.z = target.z;
            step++;
        } else {
            // Move steadily towards the target node
            ball.position.x += (dx / distance) * speed;
            ball.position.z += (dz / distance) * speed;
        }
        
        requestAnimationFrame(moveFrame);
    }
    moveFrame();
}


// --- INTERACTION (DRAG vs CLICK DETECTION) ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownPosition = { x: 0, y: 0 };

// Track where the pointer starts
window.addEventListener('pointerdown', (event) => {
    pointerDownPosition = { x: event.clientX, y: event.clientY };
});

// Execute action on pointer up ONLY if we didn't drag the screen
window.addEventListener('pointerup', (event) => {
    if (isAnimating) return; // Block input while ball is rolling

    // Check if user dragged (for panning/zooming) rather than tapped
    const moveDist = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y);
    if (moveDist > 10) return; 

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(clickableTiles);

    if (intersects.length > 0) {
        const { x, z } = intersects[0].object.userData;

        if (logicalBoard[x][z] !== 0) {
            selectedCell = { x, z };
        } else if (selectedCell && logicalBoard[x][z] === 0) {
            
            // Get the route!
            const path = findPath(selectedCell.x, selectedCell.z, x, z);
            
            if (path) {
                isAnimating = true; // Lock interaction

                // Update Logic Board immediately
                logicalBoard[x][z] = logicalBoard[selectedCell.x][selectedCell.z];
                logicalBoard[selectedCell.x][selectedCell.z] = 0;
                
                let ball = visualBoard[selectedCell.x][selectedCell.z];
                visualBoard[x][z] = ball;
                visualBoard[selectedCell.x][selectedCell.z] = null;
                
                let oldCell = selectedCell;
                selectedCell = null; // Clear selection highlight
                
                // Start physical animation
                animateBallAlongPath(ball, path, () => {
                    // When animation finishes, check rules:
                    isAnimating = false;
                    if (!checkAndClearLines()) {
                        if (!spawnBalls(3)) {
                            scoreDiv.innerHTML = `GAME OVER<br>Score: ${score}`;
                        } else {
                            checkAndClearLines();
                        }
                    }
                });
            }
        }
    }
});

// --- RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);
    
    controls.update(); // Required for damping/smooth camera movements

    clickableTiles.forEach(tile => tile.material = tileMat);
    
    // Animate pop-in of new balls and ensure rest are steady
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let z = 0; z < BOARD_SIZE; z++) {
            let ball = visualBoard[x][z];
            if (ball) {
                if (ball.scale.x < 1) ball.scale.addScalar(0.08); // Growth
                
                // Only reset Y position if it's not the selected ball
                if (!selectedCell || selectedCell.x !== x || selectedCell.z !== z) {
                    ball.position.y = 0.5; 
                }
            }
        }
    }

    // Highlight and bounce selected ball
    if (selectedCell) {
        let index = selectedCell.x * BOARD_SIZE + selectedCell.z;
        clickableTiles[index].material = tileMatSelected;
        
        let ball = visualBoard[selectedCell.x][selectedCell.z];
        if (ball && !isAnimating) {
            ball.position.y = 0.5 + Math.abs(Math.sin(Date.now() * 0.008)) * 0.3;
        }
    }

    renderer.render(scene, camera);
}

// Start game
spawnBalls(5);
animate();