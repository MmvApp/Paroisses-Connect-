module.exports = function (api) {
  api.cache(true);
  const accessibleTypography = require("./babel/accessibilityTypography");

  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [accessibleTypography],
  };
};
