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

// Smoothing factor for controlling how much smoothing to apply (adjust between 0 and 1)
const smoothingFactor = 0.1;

// Function to apply smoothing to an object's position
function smoothPosition(object, targetPosition) {
    object.position.lerp(targetPosition, smoothingFactor);
}

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

    // Function to smoothly transition height
    function toggleSiteCredits() {
      if (credits.classList.contains('show')) {
        // Collapse
        const creditsHeight = credits.scrollHeight + 'px'; // Get the current full height
        credits.style.height = creditsHeight; // Set the height before collapsing
        setTimeout(() => {
          credits.style.height = '0'; // Set height to 0 to collapse
        }, 10); // Slight delay to ensure smooth transition
      } else {
        // Expand
        const creditsHeight = credits.scrollHeight + 'px'; // Get the current full height
        credits.style.height = '0'; // Start from height 0
        setTimeout(() => {
          credits.style.height = creditsHeight; // Set height to full height to expand
        }, 10); // Slight delay to ensure smooth transition

        // After the transition, reset the height to 'auto' to allow for dynamic content resizing
        setTimeout(() => {
          credits.style.height = 'auto';
        }, 500); // Match the transition duration (0.5s)
      }

      // Toggle visibility class
      credits.classList.toggle('show');
      
      // Toggle the .open class for the opacity of #attribution
      if (credits.classList.contains('show')) {
        attribution.classList.add('open');
      } else {
        attribution.classList.remove('open');
      }
    }

    // Event listener for click
    attribution.addEventListener('click', toggleSiteCredits);
});

// Function to create the thumbnail menu
function createThumbnailMenu(config) {
    const menuContainer = document.getElementById('experience-menu'); 

    config.experiences.forEach((exp, index) => {
        const thumbnail = document.createElement('img');
        thumbnail.src = `${config.basePath}${exp.folder}/${config.thumbsFile}`; 
        thumbnail.alt = exp.name;
        thumbnail.className = 'thumb'; 

        // Automatically add the .selected class to the first (default) experience
        if (index === 0) {
            thumbnail.classList.add('selected');  // Add .selected to the default experience thumbnail
        }

        // Add a click event listener to each thumbnail
        thumbnail.addEventListener('click', function() {
            // Remove the .selected class from any currently selected thumbnail
            const currentSelected = document.querySelector('.thumb.selected');
            if (currentSelected) {
                currentSelected.classList.remove('selected');
            }

            // Add the .selected class to the clicked thumbnail
            this.classList.add('selected');
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

// Function to load AR experience with animation support
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

        // Set up target detection and media handling (GLB, FBX, and video) for each image
        setupTargetDetection(experience.targets, experience.folder);

        // Animation loop for rendering and shader updates
        const clock = new THREE.Clock();
        const animate = () => {
            const deltaTime = clock.getDelta();  // Get time elapsed since last frame

            // Update all animation mixers
            mixers.forEach((mixer) => {
                mixer.update(deltaTime);  // Update mixer for the current frame
            });

            composer.render(); // Render using the composer (with post-processing)
            requestAnimationFrame(animate); // Loop the animation
        };
        animate(); // Start animation

    } catch (error) {
        console.error("Failed to start AR session:", error);
    }
}

// Global variable to store animation mixers
const mixers = [];

// Functon to load GLB Models
function loadGLBModel(url, anchor, transform) {
    loader.load(
        url,
        (gltf) => {
            const model = gltf.scene;

            // Apply position, rotation, and scale from the transform object
            if (transform) {
                if (transform.position) {
                    smoothPosition(model, new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z));
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

                // Apply opacity to model's material if defined
                if (transform.opacity !== undefined) {
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.material.transparent = true;
                            child.material.opacity = transform.opacity;  // Apply opacity from transform
                        }
                    });
                }

                // Apply glow intensity for GLB models
                if (transform.glowIntensity !== undefined) {
                    applyGlowEffect(transform.glowIntensity);  // Apply glow intensity for the GLB model
                }
            }

            // Add model to the anchor group
            anchor.group.add(model);

            // Check if the GLB contains animations
            if (gltf.animations && gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);  // Create an AnimationMixer for the model
                mixers.push(mixer);  // Store the mixer in the global array to update in the animation loop

                // Loop through all animations and play them
                gltf.animations.forEach((clip) => {
                    const action = mixer.clipAction(clip);
                    action.play();  // Start the animation
                });
            }
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
        const { targetIndex, transform, videoProperties, imageProperties } = entry;

        // Create an anchor for each image using its target index
        const anchor = mindARInstance.addAnchor(targetIndex);

        let video, videoPlane;  // Declare video and videoPlane variables here

        // Handle video properties separately
        if (entry.video && entry.video !== "") {
            const videoSrc = `${experienceConfig.basePath}${experienceFolder}/${experienceConfig.videoFolder}/${entry.video}`;
            const { width, height, opacity, position } = videoProperties || {};

            // Assign values to video and videoPlane
            ({ plane: videoPlane, video } = createVideoPlane(videoSrc, width, height, opacity));

            if (position) {
                smoothPosition(videoPlane, new THREE.Vector3(position.x, position.y, position.z));
            }
            anchor.group.add(videoPlane);  // Add the video plane to the anchor group
        }

        let imagePlane;  // Declare imagePlane variable

        // Handle image plane only if the image field is populated (not empty)
        if (entry.image && entry.image !== "") {
            const imageSrc = `${experienceConfig.basePath}${experienceFolder}/${experienceConfig.imageFolder}/${entry.image}`;
            const { width, height, opacity, position } = imageProperties || {};

            imagePlane = createImagePlane(imageSrc, width, height, opacity);  // Assign imagePlane
            if (position) {
                smoothPosition(imagePlane, new THREE.Vector3(position.x, position.y, position.z));
            }
            anchor.group.add(imagePlane);  // Add the image plane to the anchor group
        }

        // Load the GLB model only if defined, and pass the transform object
        if (entry.glbModel && entry.glbModel !== "") {
            const glbModelPath = `${experienceConfig.basePath}${experienceFolder}/${experienceConfig.glbFolder}/${entry.glbModel}`;
            loadGLBModel(glbModelPath, anchor, transform);  // Pass the transform from JSON
        }

        // Handle target found and lost events
        anchor.onTargetFound = () => {
            if (video) video.play();  // Start video playback when the target is detected, only if video exists
            if (videoProperties) applyEffects(videoProperties);  // Apply glow shader effects for video
            if (imageProperties) applyEffects(imageProperties);  // Apply glow shader effects for image
        };

        anchor.onTargetLost = () => {
            if (video) video.pause();  // Pause video when the target is lost, only if video exists
            resetEffects();  // Reset shader effects
        };
    });
}

function applyGlowEffect(glowIntensity) {
    if (glowPass && glowPass.uniforms) {
        glowPass.uniforms['glowIntensity'].value = glowIntensity;
    }
}

// Function to apply glow and opacity for videos based on properties
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

function createImagePlane(imageSrc, imageWidth, imageHeight, opacity) {
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(imageSrc);

    const aspectRatio = imageWidth / imageHeight;
    const planeWidth = 1;  // Maintain aspect ratio
    const planeHeight = planeWidth / aspectRatio;

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: opacity
    });

    return new THREE.Mesh(geometry, material);  // Return image plane mesh
}

console.log('version check: 0.0.4c');
