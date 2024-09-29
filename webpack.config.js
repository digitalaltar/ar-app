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
      }
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
};
