/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/** @type {import('webpack').Configuration} */
const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    vscode: 'commonjs vscode',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'resources', to: 'resources' },
        { from: 'syntaxes', to: 'syntaxes' },
      ],
    }),
  ],
  devtool: 'nosources-source-map',
  infrastructureLogging: { level: 'log' },
};

/** @type {import('webpack').Configuration} */
const webviewConfig = {
  target: 'web',
  mode: 'none',
  entry: {
    index: './src/webview/index.ts',
    sidebar: './src/webview/sidebar.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: { configFile: 'tsconfig.webview.json' },
          },
        ],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  devtool: 'nosources-source-map',
};

module.exports = [extensionConfig, webviewConfig];
