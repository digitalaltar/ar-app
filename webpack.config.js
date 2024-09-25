const path = require('path');

module.exports = {
  entry: './source.js',  // Entry point (your unbundled JavaScript file)
  output: {
    filename: 'app.js',  // Output file (Webpack will generate this)
    path: path.resolve(__dirname, 'public'),  // Output directory set to /public
  },
  mode: 'development',  // Use 'development' for debugging and 'production' for optimized builds
};
