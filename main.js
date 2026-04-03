import * as THREE from 'three';

// --- MOBILE BROWSER PROTECTIONS ---
// Prevent zooming, scrolling, and pull-to-refresh on mobile
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.touchAction = 'none'; // Critical for mobile games
document.body.style.backgroundColor = '#222';
document.body.style.userSelect = 'none';
document.body.style.webkitUserSelect = 'none';

// --- GAME SETTINGS & STATE ---
const BOARD_SIZE = 9;
const COLORS = [
    0xff0000, // Red
    0x00ff00, // Green
    0x0088ff, // Light Blue (easier to see on dark bg)
    0xffff00, // Yellow
    0x00ffff, // Cyan
    0xff00ff, // Magenta
    0xff8800  // Orange
];

let logicalBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
let visualBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
let selectedCell = null;
let score = 0;

// --- UI SETUP (MOBILE OPTIMIZED) ---
const scoreDiv = document.createElement('div');
scoreDiv.style.position = 'absolute';
scoreDiv.style.top = '5%';
scoreDiv.style.width = '100%';
scoreDiv.style.textAlign = 'center';
scoreDiv.style.color = 'white';
scoreDiv.style.fontFamily = 'Arial, sans-serif';
scoreDiv.style.fontSize = '32px'; // Larger for mobile
scoreDiv.style.fontWeight = 'bold';
scoreDiv.style.pointerEvents = 'none';
scoreDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
scoreDiv.innerText = `Score: ${score}`;
document.body.appendChild(scoreDiv);

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Save battery on high-res phones
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 15, 5);
scene.add(dirLight);

// Geometries & Materials
const tileGeo = new THREE.BoxGeometry(0.95, 0.1, 0.95);
const tileMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
const tileMatSelected = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const ballGeo = new THREE.SphereGeometry(0.4, 32, 32);

const clickableTiles = [];

// --- INITIALIZE BOARD ---
for (let x = 0; x < BOARD_SIZE; x++) {
    for (let z = 0; z < BOARD_SIZE; z++) {
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.position.set(x, 0, z);
        tile.userData = { x, z };
        scene.add(tile);
        clickableTiles.push(tile);
    }
}

// --- DYNAMIC CAMERA FRAMING FOR PORTRAIT ---
function updateCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    
    // If the screen is narrow (portrait), pull the camera higher up so the 9x9 board fits
    if (aspect < 1) {
        camera.position.set(4, 14 + (1 / aspect) * 2, 9); 
    } else {
        // Landscape fallback
        camera.position.set(4, 10, 9);
    }
    
    camera.lookAt(4, 0, 4); // Look at the exact center of the 9x9 board
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', updateCamera);
updateCamera(); // Call once to set initial view

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
        
        // Pop-in animation scale
        ball.scale.set(0, 0, 0);
        scene.add(ball);
        visualBoard[x][z] = ball;
    }
    
    return emptyCells.length > count;
}

function hasPath(startX, startZ, endX, endZ) {
    let queue = [{ x: startX, z: startZ }];
    let visited = new Set([`${startX},${startZ}`]);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

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

// --- TOUCH & MOUSE INTERACTION ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function onPointerDown(event) {
    // pointerdown covers both touch and mouse clicks natively
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(clickableTiles);

    if (intersects.length > 0) {
        const { x, z } = intersects[0].object.userData;

        if (logicalBoard[x][z] !== 0) {
            selectedCell = { x, z };
        } else if (selectedCell && logicalBoard[x][z] === 0) {
            if (hasPath(selectedCell.x, selectedCell.z, x, z)) {
                
                logicalBoard[x][z] = logicalBoard[selectedCell.x][selectedCell.z];
                logicalBoard[selectedCell.x][selectedCell.z] = 0;
                
                let ball = visualBoard[selectedCell.x][selectedCell.z];
                ball.position.set(x, 0.5, z);
                visualBoard[x][z] = ball;
                visualBoard[selectedCell.x][selectedCell.z] = null;
                
                selectedCell = null;

                if (!checkAndClearLines()) {
                    if (!spawnBalls(3)) {
                        scoreDiv.innerHTML = `GAME OVER<br>Score: ${score}`;
                    } else {
                        checkAndClearLines();
                    }
                }
            }
        }
    }
}
window.addEventListener('pointerdown', onPointerDown);

// --- RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);

    clickableTiles.forEach(tile => tile.material = tileMat);
    
    // Animate newly spawned balls popping in
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let z = 0; z < BOARD_SIZE; z++) {
            let ball = visualBoard[x][z];
            if (ball) {
                if (ball.scale.x < 1) {
                    ball.scale.addScalar(0.1); // Pop-in growth
                }
                ball.position.y = 0.5; // Ensure resting position
            }
        }
    }

    // Highlight and bounce selected ball
    if (selectedCell) {
        let index = selectedCell.x * BOARD_SIZE + selectedCell.z;
        clickableTiles[index].material = tileMatSelected;
        
        let ball = visualBoard[selectedCell.x][selectedCell.z];
        if (ball) ball.position.y = 0.5 + Math.abs(Math.sin(Date.now() * 0.008)) * 0.3;
    }

    renderer.render(scene, camera);
}

// Start game
spawnBalls(5);
animate();