const path = require('path');

module.exports = {
  mode: 'production',
  target: 'web',
  entry: './src/previewmarkdown/sidebar-mermaid/index.ts',
  output: {
    path: path.resolve(__dirname, '../dist-sidebar'),
    filename: 'mermaid.js',
    clean: true,
    chunkLoading: false,
  },
  resolve: {
    extensions: ['.ts', '.js', '.mjs', '.json'],
    fallback: {
      fs: false,
      path: false,
      tty: false,
      util: false,
      os: false,
    },
    mainFields: ['module', 'main'],
  },
  experiments: {
    topLevelAwait: true,
  },
  optimization: {
    minimize: true,
    splitChunks: false,
    runtimeChunk: false,
    removeAvailableModules: false,
    removeEmptyChunks: false,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [{
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, '../tsconfig.json'),
            transpileOnly: true,
          },
        }],
        exclude: /node_modules\/(?!@mermaid-chart)/,
      },
      {
        test: /\.m?js/,
        resolve: { fullySpecified: false },
        type: 'javascript/auto',
      },
      {
        test: /\.json$/,
        type: 'json',
      },
    ],
  },
  devtool: false,
};
