const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Fix: Firebase creates temp files that Metro's FallbackWatcher tries to watch
// and crashes when they disappear. Exclude node_modules temp dirs from watching.
config.watchFolders = [
  path.resolve(__dirname, "../../node_modules"),
  __dirname,
].filter(Boolean);

// Exclude temp files created by Firebase logger
const originalBlockList = config.resolver?.blockList;
config.resolver = {
  ...config.resolver,
  blockList: [
    ...(Array.isArray(originalBlockList) ? originalBlockList : originalBlockList ? [originalBlockList] : []),
    /.*_tmp_\d+$/,
  ],
};

module.exports = config;
