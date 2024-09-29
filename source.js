// Import necessary libraries
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // Import GLTFLoader for loading .glb files
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'; // Import DRACOLoader for Draco compression
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Global variables
let mindARInstance = null;
let experiences = [];
let experienceConfig;
let lastExperience = null; // Track the last experience to prevent reloading
let glowPass, composer;

// Initialize GLTFLoader and DRACOLoader
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./wasm/'); // Set the path to where your .wasm file will be

loader.setDRACOLoader(dracoLoader);

// Wait for the DOM to be fully loaded
window.addEventListener('DOMContentLoaded', async () => {
    // Ensure the DOM is ready, including the #mindar-container
    await new Promise(resolve => setTimeout(resolve, 100)); // Tiny delay to ensure readiness
    experienceConfig = await fetch("./experiences.json").then(res => res.json());
    experiences = experienceConfig.experiences;

    loadARExperience(experiences[0]);
    createThumbnailMenu(experienceConfig);

    // Site credits functionality
    const attribution = document.getElementById('attribution');
    const credits = document.getElementById('site-credits');

    // Toggle the visibility of the credits on click
    attribution.addEventListener('click', () => {
        credits.style.display = credits.style.display === 'none' || credits.style.display === '' ? 'block' : 'none';
    });
});

// Function to create the thumbnail menu
function createThumbnailMenu(config) {
    const menuContainer = document.getElementById('experience-menu'); 

    config.experiences.forEach(exp => {
        const thumbnail = document.createElement('img');
        thumbnail.src = `${config.basePath}${exp.folder}/${config.thumbsFile}`; 
        thumbnail.alt = exp.name;
        thumbnail.className = 'thumbnail'; 

        thumbnail.addEventListener('click', () => {
            loadARExperience(exp); 
        });

        menuContainer.appendChild(thumbnail); 
    });
}

async function disposeARSession() {
    if (mindARInstance) {
        console.log('Disposing of existing MindAR session...');

        try {
            await mindARInstance.stop();
            console.log('Session stopped');

            if (mindARInstance.renderer) {
                mindARInstance.renderer.forceContextLoss();
                console.log('Context loss forced');

                mindARInstance.renderer.dispose();
                console.log('Renderer disposed');

                mindARInstance.renderer.domElement = null;
                mindARInstance.renderer.state.reset(); // Reset WebGL state
                console.log('DOM element nullified and WebGL state reset');
            }

            if (composer) {
                composer.passes = [];  // Clear previous passes
            }
        } catch (error) {
            console.error('Error during disposal:', error);
        }

        mindARInstance = null;

        // Clear #mindar-container and remove UI overlays
        const mindarContainer = document.querySelector("#mindar-container");
        if (mindarContainer) {
            mindarContainer.innerHTML = ''; // Clear container
        }

        // Remove any lingering UI overlays
        document.querySelectorAll('.mindar-ui-overlay').forEach(overlay => overlay.remove());

        console.log('MindAR container and overlays cleared');
    }
}

// Function to load AR experience
async function loadARExperience(experience) {
    if (lastExperience === experience) {
        console.log("This experience is already loaded.");
        return;
    }

    lastExperience = experience;

    await disposeARSession();

    try {
        // Initialize MindAR session
        mindARInstance = new MindARThree({
            container: document.querySelector("#mindar-container"),
            imageTargetSrc: `${experienceConfig.basePath}${experience.folder}/${experienceConfig.targetsFile}`
        });

        await mindARInstance.start();
        console.log("AR Experience started successfully:", experience.name);

        // Extract scene, camera, and renderer from MindAR instance
        const { renderer, scene, camera } = mindARInstance;
        renderer.setClearColor(0x000000, 0); // Transparent background

        // Set up lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 2);
        scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1, 100);
        pointLight.position.set(5, 5, 5);
        scene.add(pointLight);

        // Initialize EffectComposer for post-processing
        composer = new EffectComposer(renderer);
        
        // Reinitialize shader passes to prevent reusing old ones
        glowPass = new ShaderPass(GlowShader);

        // Add render and shader passes
        composer.passes = [];  // Clear any previous passes
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(glowPass);

        // Set up target detection and media handling (GLB and video) for each image
        setupTargetDetection(experience.images, experience.folder);

        // Animation loop for rendering and shader updates
        const clock = new THREE.Clock();
        const animate = () => {
            const elapsedTime = clock.getElapsedTime();
            composer.render(); // Render using the composer
            requestAnimationFrame(animate); // Loop the animation
        };
        animate(); // Start animation

    } catch (error) {
        console.error("Failed to start AR session:", error);
    }
}

// Function to load a GLB model for each image and apply transformations
function loadGLBModel(url, anchor, transform) {
    loader.load(
        url,
        (gltf) => {
            const model = gltf.scene;

            // Apply position, rotation, and scale from the transform object
            if (transform) {
                if (transform.position) {
                    model.position.set(transform.position.x, transform.position.y, transform.position.z);
                }
                if (transform.rotation) {
                    model.rotation.set(
                        THREE.MathUtils.degToRad(transform.rotation.x),
                        THREE.MathUtils.degToRad(transform.rotation.y),
                        THREE.MathUtils.degToRad(transform.rotation.z)
                    );
                }
                if (transform.scale) {
                    model.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
                }
            }

            anchor.group.add(model);  // Add the transformed model to the anchor group
        },
        undefined,  // onProgress
        (error) => {
            console.error('An error occurred while loading the GLB model:', error);
        }
    );
}

// Custom Glow Shader
const GlowShader = {
  uniforms: {
    tDiffuse: { value: null },
    glowIntensity: { value: 1.0 },  // Default minimum of 1.0
    time: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float glowIntensity;
    uniform float time;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 glow = color.rgb * (1.0 + glowIntensity); // Ensure intensity is 1 + value from JSON
      gl_FragColor = vec4(glow, color.a);
    }
  `
};

// Function to set up target detection and media handling
function setupTargetDetection(mediaData, experienceFolder) {
    mediaData.forEach((entry) => {
        const { targetIndex, properties } = entry;
        if (properties === undefined) {
            console.error(`Properties are missing for image with target index ${targetIndex}`);
            return;
        }

        // Create an anchor for each image using its target index
        const anchor = mindARInstance.addAnchor(targetIndex);

        // Load the GLB model only if defined, and pass the transform object
        if (entry.glbModel) {
            const glbModelPath = `${experienceConfig.basePath}${experienceFolder}/${entry.glbModel}`;
            loadGLBModel(glbModelPath, anchor, entry.transform);  // Pass the transform from JSON
        }

        const videoSrc = `${experienceConfig.basePath}${experienceFolder}/${entry.video}`;
        const { width, height, opacity } = properties;

        if (width === undefined || height === undefined || opacity === undefined) {
            console.error(`Missing properties for media entry with target index ${targetIndex}`);
            return;
        }

        const { plane, video } = createVideoPlane(videoSrc, width, height, opacity);
        anchor.group.add(plane);  // Add the video plane to the anchor group

        anchor.onTargetFound = () => {
            video.play();  // Start video playback when the target is detected
            applyEffects(properties);  // Apply glow shader effects
        };

        anchor.onTargetLost = () => {
            video.pause();  // Pause video when the target is lost
            resetEffects();  // Reset shader effects
        };
    });
}

// Function to apply effects based on entry properties
function applyEffects(properties) {
    const glowIntensity = properties.glowIntensity || 0;
    glowPass.uniforms['glowIntensity'].value = glowIntensity;
}

// Function to reset shader effects
function resetEffects() {
    glowPass.uniforms['glowIntensity'].value = 0;
}

// Function to create a video plane
function createVideoPlane(videoSrc, videoWidth, videoHeight, opacity) {
    const video = document.createElement('video');
    video.src = videoSrc;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.load();

    video.addEventListener('canplay', () => {
        video.play();
    });

    const texture = new THREE.VideoTexture(video);
    const aspectRatio = videoWidth / videoHeight;
    const planeWidth = 1; 
    const planeHeight = planeWidth / aspectRatio;

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: opacity
    });

    return { plane: new THREE.Mesh(geometry, material), video };
}

console.log('version check: 0.0.3i');
