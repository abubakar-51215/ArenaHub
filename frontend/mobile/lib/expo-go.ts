import Constants from 'expo-constants';

/** True inside the Expo Go app (not in a real build). Push notifications were removed from Expo Go in SDK 53. */
export const isExpoGo = Constants.executionEnvironment === 'storeClient';
