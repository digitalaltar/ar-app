// Import necessary libraries
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Global variables
let mindARInstance;
let experiences = [];
let experienceConfig; // Declare the experienceConfig variable here

// Wait for the DOM to be fully loaded
window.addEventListener('DOMContentLoaded', async () => {
    experienceConfig = await fetch("./experiences.json").then(res => res.json());
    experiences = experienceConfig.experiences;

    // Load initial AR session with the first experience
    loadARExperience(experiences[0]); // Load the default experience

    // Create thumbnail menu
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
    const menuContainer = document.getElementById('experience-menu'); // Assumes there is a container for the thumbnails

    config.experiences.forEach(exp => {
        const thumbnail = document.createElement('img');
        thumbnail.src = `${config.basePath}${exp.folder}/${config.thumbsFile}`; // Load the thumbnail image
        thumbnail.alt = exp.name;
        thumbnail.className = 'thumbnail'; // Add some styling class

        thumbnail.addEventListener('click', () => {
            loadARExperience(exp); // Load the AR experience for the selected thumbnail
        });

        menuContainer.appendChild(thumbnail); // Append thumbnail to the menu
    });
}

// Function to load an AR experience
async function loadARExperience(experience) {
    const mindFileUrl = `${experienceConfig.basePath}${experience.folder}/${experienceConfig.targetsFile}`; // Construct the mind file path

    // Stop existing AR instance if it exists
    if (mindARInstance) {
        await mindARInstance.stop();
    }

    mindARInstance = new MindARThree({
        container: document.querySelector("#mindar-container"),
        imageTargetSrc: mindFileUrl
    });

    await mindARInstance.start().then(() => {
        console.log("AR Experience loaded:", experience.name);
        setupTargetDetection(experience.images, experience.folder); // Pass the folder for correct path construction
    }).catch(error => {
        console.error("Failed to start AR session:", error);
    });
}

// Custom Chromatic Aberration Shader
const ChromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.02 }, 
        glitchAmount: { value: 0 }, 
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
        uniform float amount;
        uniform float glitchAmount;
        uniform float time;
        varying vec2 vUv;

        float random(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 uv = vUv;
            float blockSize = 0.05; // Size of glitch blocks
            vec2 blockCoords = floor(uv / blockSize) * blockSize; 
            vec2 glitchMovement = vec2(sin(time * 5.0), cos(time * 3.0)) * blockSize * 0.5; 

            if (random(blockCoords + time) < glitchAmount) {
                uv += glitchMovement; // Displace blocks
            }

            vec2 redOffset = amount * vec2(sin(time * 2.0), cos(time * 2.0));
            vec2 greenOffset = amount * vec2(sin(time + 2.0), cos(time + 2.0));
            vec2 blueOffset = amount * vec2(sin(time + 4.0), cos(time + 4.0));

            vec4 cr = texture2D(tDiffuse, uv + redOffset);
            vec4 cg = texture2D(tDiffuse, uv);
            vec4 cb = texture2D(tDiffuse, uv - blueOffset);

            gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
        }
    `
};

// Custom Glow Shader
const GlowShader = {
    uniforms: {
        tDiffuse: { value: null },
        glowIntensity: { value: 1.0 },
        glitchAmount: { value: 0 }, // Glitch intensity
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
        uniform float glitchAmount;
        uniform float time;
        varying vec2 vUv;

        float random(vec2 co){
            return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);

            // Controlled glitch: Hide only small parts of the image
            if (random(vUv + time) < glitchAmount) {
                color.rgb *= 0.5; // Make glitch darker for better visibility
            }

            vec3 glow = color.rgb * glowIntensity;
            gl_FragColor = vec4(glow, color.a);
        }
    `
};

// Function to set up target detection and media handling
function setupTargetDetection(mediaData, experienceFolder) {
    mediaData.forEach((entry, index) => {
        const properties = entry.properties; // Access properties for each image
        if (!properties) {
            console.error(`Properties are undefined for image entry at index ${index}`, entry);
            return; // Skip to next iteration if properties are missing
        }

        const anchor = mindARInstance.addAnchor(index);
        const videoSrc = `${experienceConfig.basePath}${experienceFolder}/${entry.video}`; // Adjusted path to include the folder

        // Create the video plane with the properties from the JSON
        const { width, height, opacity } = properties;

        // Ensure width, height, and opacity are defined
        if (width === undefined || height === undefined || opacity === undefined) {
            console.error(`Missing properties for media entry at index ${index}:`, entry);
            return; // Skip if any required property is missing
        }

        const { plane, video } = createVideoPlane(videoSrc, width, height, opacity);
        anchor.group.add(plane); // Add video plane to anchor

        anchor.onTargetFound = () => {
            video.play(); // Play video when target found
            applyEffects(properties); // Apply effects using the shader properties from the entry
        };

        anchor.onTargetLost = () => {
            video.pause(); // Pause video when target lost
        };
    });
}

// Function to apply effects based on entry properties
function applyEffects(properties) {
    const rgbShiftIntensity = properties.rgbShiftIntensity || 0;
    const glowIntensity = properties.glowIntensity || 0;
    const glitchAmount = properties.glitchAmount || 0.1;

    // Set shader properties
    chromaticAberrationPass.uniforms['amount'].value = rgbShiftIntensity;
    glowPass.uniforms['glowIntensity'].value = glowIntensity;
    chromaticAberrationPass.uniforms['glitchAmount'].value = glitchAmount;
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
    const planeWidth = 1; // Adjust plane width as needed
    const planeHeight = planeWidth / aspectRatio;

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: opacity
    });

    return { plane: new THREE.Mesh(geometry, material), video };
}
