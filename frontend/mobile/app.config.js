// The app's config is app.json; this file only adds what needs values from the environment.
//
// Continue with Google uses the native Google sign-in library through its config plugin. It works only in a
// development or store build (not in Expo Go), and its iOS part needs the URL scheme made from the iOS OAuth
// client id. No client id is written in the code: the plugin is added only when GOOGLE_IOS_URL_SCHEME is set
// for the build (see docs/BEFORE_GOING_LIVE.md, "Decide at the very end").
//
// Push on Android needs Firebase's google-services.json inside the build. The file is never in the repo: it is
// either an EAS file secret named GOOGLE_SERVICES_JSON, or a local frontend/mobile/google-services.json (git
// ignores it). With neither, the build is made without it (push then does not work on Android) instead of
// failing. See docs/DEV_BUILD_AND_GOOGLE_PUSH.md, step 4.
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  if (iosUrlScheme) {
    config.plugins = [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]];
  }

  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  if (googleServicesFile) {
    config.android = { ...config.android, googleServicesFile };
  }
  return config;
};
