const path = require('path');
const { UserscriptPlugin } = require('webpack-userscript');

const original = require("./src/header.js");
const { pathToFileURL } = require('url');

module.exports = {
  mode: 'production',
  optimization: {
    minimize: false
  },
  entry: path.resolve(__dirname, 'src', 'script.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'nedFoxAuto.user.js',
  },
  watch: true,
  devServer: {
    static: path.join(__dirname, 'dist'),
  },
  plugins: [
    new UserscriptPlugin({
      headers: require("./src/header.js"),
      proxyScript: {
        baseURL: pathToFileURL(path.resolve(__dirname, "dist", 'nedFoxAuto.proxy.user.js')),
        filename: '[basename].proxy.user.js',
      },
    }),
  ],
};