// The app's config is app.json; this file only adds what needs values from the environment.
//
// Continue with Google uses the native Google sign-in library through its config plugin. It works only in a
// development or store build (not in Expo Go), and its iOS part needs the URL scheme made from the iOS OAuth
// client id. No client id is written in the code: the plugin is added only when GOOGLE_IOS_URL_SCHEME is set
// for the build (see docs/BEFORE_GOING_LIVE.md, "Decide at the very end").
module.exports = ({ config }) => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  if (iosUrlScheme) {
    config.plugins = [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]];
  }
  return config;
};
