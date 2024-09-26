import * as tf from '@tensorflow/tfjs';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

let model;
let mindARInstance;
let videoElement;
let webcamElement;  // Moved this outside

// Default experience if none is detected
const defaultExperience = "Default Experience"; // Replace with actual default experience name
let classNames = []; // Array to hold class names

// Wait for the DOM to load
document.addEventListener('DOMContentLoaded', async function () {
    webcamElement = document.getElementById("webcam");

    if (!webcamElement) {
        console.error("Webcam element not found");
        return;
    }

    try {
        // Start webcam stream
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            webcamElement.srcObject = stream;

            // Wait for the video to load and log dimensions
            webcamElement.addEventListener('loadeddata', async () => {
                console.log('Webcam video dimensions:', webcamElement.videoWidth, webcamElement.videoHeight);
                
                // Load the model before starting predictions
                await loadTeachableModel();

                // Load experiences to get class names
                const experienceConfig = await fetch("./experiences.json").then(res => res.json());
                classNames = experienceConfig.experiences.map(exp => exp.folder); // Map folder names to classNames
                
                console.log('Class Names:', classNames); // Log the class names for debugging

                // Start periodic checking for predictions
                setInterval(async () => {
                    await checkForExperience();
                }, 3000); // Check every 3 seconds
            });
        }
    } catch (err) {
        console.error("Error starting webcam:", err);
    }
});

// Load the Teachable Machine Model
async function loadTeachableModel() {
    try {
        model = await tf.loadGraphModel('./models/model.json');
        console.log("Model loaded successfully");
    } catch (error) {
        console.error("Failed to load the model:", error);
        model = null; // Set model to null to handle it properly later
    }
}

// Check for experience based on image prediction
async function checkForExperience() {
    const experienceName = await predictExperience();
    
    if (experienceName) {
        console.log("Detected Experience Name:", experienceName);
        const experienceConfig = await fetch("./experiences.json").then(res => res.json());
        
        // Match with folder name
        const recognizedExperience = experienceConfig.experiences.find(exp => exp.folder === experienceName);
        
        if (recognizedExperience) {
            console.log("Recognized Experience:", recognizedExperience);
            // Only load MindAR if there is no current instance running
            if (!mindARInstance) {
                await loadMindAR(recognizedExperience); // Load MindAR only if a match is found
                handleTargetDetection(recognizedExperience);
            } else {
                console.log("MindAR is already running. Skipping new load.");
            }
        } else {
            console.error("Experience not recognized:", experienceName);
        }
    } else {
        console.log("No experience detected. Defaulting to:", defaultExperience);
        // Optionally load a default experience here if desired
    }
}

// Get the highest probability prediction
function getHighestPrediction(predictions) {
    let highestPrediction = null;
    let highestProbability = 0;

    console.log('Full Predictions:', predictions); // Log the full predictions for debugging

    predictions.forEach((probability, index) => {
        console.log(`Class: ${classNames[index]}, Probability: ${probability}`); // Log class and probability for debugging

        if (probability > highestProbability) {
            highestPrediction = classNames[index]; // Use the folder name as the class name
            highestProbability = probability;
        }
    });

    return highestPrediction;
}

// Predict Experience using Teachable Machine
async function predictExperience() {
    // Ensure webcam dimensions are valid
    if (webcamElement.videoWidth === 0 || webcamElement.videoHeight === 0) {
        console.error("Invalid webcam dimensions.");
        return null; // or handle the error appropriately
    }

    const img = tf.browser.fromPixels(webcamElement);
    const resizedImg = img.resizeNearestNeighbor([224, 224]).toFloat().expandDims(0);

    const predictionsTensor = model.predict(resizedImg);
    const predictions = await predictionsTensor.array();
    
    console.log('Predictions:', predictions); // Log the full predictions for debugging

    return getHighestPrediction(predictions[0]); // Assuming predictions is an array of arrays
}

// Load MindAR.js for image tracking
async function loadMindAR(experience) {
    if (mindARInstance) {
        mindARInstance.stop(); // Stop the current instance
        mindARInstance = null;
        document.getElementById("ar-container").innerHTML = '';  // Clear previous AR content
    }

    const mindFileUrl = `./experiences/${experience.folder}/${experience.mindFile}`;

    console.log("Loading MindAR with file:", mindFileUrl); // Log the URL being loaded

    mindARInstance = new MindARThree({
        container: document.querySelector('#ar-container'),
        imageTargetSrc: mindFileUrl,
    });

    try {
        await mindARInstance.start();
        console.log("MindAR started successfully for experience:", experience.name);
    } catch (error) {
        console.error("Failed to start MindAR:", error);
    }
}

// Handle target detection
function handleTargetDetection(experience) {
    mindARInstance.onTargetFound = (targetIndex) => {
        const videoUrl = findVideoForTarget(experience, targetIndex);
        if (videoUrl) playVideo(videoUrl);
        console.log(`Target found: ${targetIndex}`);
    };

    mindARInstance.onTargetLost = (targetIndex) => {
        console.log(`Target lost: ${targetIndex}`);
        // Optional: Add any handling logic for when the target is lost
    };

    mindARInstance.onError = (error) => {
        console.error("MindAR Error:", error); // Log any errors from MindAR
    };
}

// Play video for a specific target
function playVideo(videoUrl) {
    if (videoElement) {
        videoElement.pause();
        videoElement.remove();
    }

    videoElement = document.createElement("video");
    videoElement.src = videoUrl;
    videoElement.style.position = "absolute";
    videoElement.style.width = "100%";
    videoElement.muted = true;
    videoElement.loop = true;
    document.getElementById("ar-container").appendChild(videoElement);
    videoElement.play();
}

// Find video for a target
function findVideoForTarget(experience, targetIndex) {
    const target = experience.images.find(image => image.targetIndex === targetIndex);
    return target ? `./experiences/${experience.folder}/${target.video}` : null;
}
