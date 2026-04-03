import * as THREE from 'three';

// 1. Create a Scene
const scene = new THREE.Scene();

// 2. Create a Camera (Field of View, Aspect Ratio, Near clipping, Far clipping)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// 3. Create a Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 4. Create a 3D Object (A Cube)
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// 5. Create an Animation Loop
function animate() {
    requestAnimationFrame(animate);

    // Rotate the cube on every frame
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // Render the scene
    renderer.render(scene, camera);
}

// Handle browser window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the animation
animate();