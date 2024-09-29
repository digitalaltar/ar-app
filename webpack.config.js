const path = require('path');

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
            outputPath: 'public/wasm/', // Specifies the folder where the wasm file will be output
          },
        },
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
};
