const path = require('path');

module.exports = {
  entry: './source.js',
  output: {
    filename: 'app.js',
    path: path.resolve(__dirname, 'public'),
  },
  resolve: {
      extensions: ['.js']
  },
  mode: 'development',
};
