const path = require('path');
const fs = require('fs');

// Load experiences.json
const experiencesConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'public/experiences.json'), 'utf-8'));

module.exports = {
  entry: './source.js',
  output: {
    filename: 'app.js',
    path: path.resolve(__dirname, 'public'),
  },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.(wasm)$/,
        type: 'javascript/auto',
        use: {
          loader: 'file-loader',
          options: {
            name: '[name].[ext]',
            outputPath: 'public/wasm/', // Output folder for WASM files
          },
        },
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
      {
        test: /\.(fbx)$/, // Rule for FBX files
        use: {
          loader: 'file-loader',
          options: {
            name: '[name].[ext]', // Keep the original file name
            outputPath: (url, resourcePath) => {
              // Use the folder field from experiences.json to dynamically determine the output path
              const experienceFolder = getExperienceFolder(resourcePath);
              return experienceFolder ? `experiences/${experienceFolder}/` : 'experiences/other/';
            },
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
};

// Helper function to determine the correct experience folder from experiences.json
function getExperienceFolder(resourcePath) {
  for (const experience of experiencesConfig.experiences) {
    // Check if the resourcePath contains the folder name specified in the experiences.json
    if (resourcePath.includes(experience.folder)) {
      return experience.folder; // Return the folder name for this experience
    }
  }
  return null; // If no match is found, return null
}
