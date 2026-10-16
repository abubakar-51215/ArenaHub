module.exports = function (api) {
  api.cache(true);
  return {
    // zustand's ESM build reads import.meta.env, which Metro's non-module web
    // bundle can't parse ("Cannot use 'import.meta' outside a module").
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
  };
};
