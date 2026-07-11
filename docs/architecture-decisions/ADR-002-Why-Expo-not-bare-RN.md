# ADR-002: Why Expo (managed) instead of bare React Native

**Status:** Accepted · **Date:** 2026-07-12 · **Sprint:** 1

## Context
The player app is React Native (doc 01/02). Bare React Native requires native
Android Studio / Xcode toolchains, manual native module linking, and a Mac for
iOS builds. A two-person FYP team on Windows needs to demo on Android quickly,
iterate fast, and avoid native build friction. The deprecated global
`expo-cli` is explicitly off the table.

## Decision
Use **Expo (managed workflow), SDK 54, TypeScript**, scaffolded with
`npx create-expo-app`. Produce release builds later with **EAS Build** (cloud),
which can build iOS without a local Mac.

## Consequences
- **Positive:** Fast setup and OTA-style iteration; Expo Go for instant
  on-device testing; cloud iOS builds via EAS avoid needing a Mac; batteries
  included for the modules we need (maps via `react-native-maps`, notifications,
  image picker for receipts). Android-first demo path is smooth.
- **Negative / trade-offs:** Managed workflow constrains use of arbitrary
  native modules; some libraries need Expo config plugins; app binaries are
  larger. Apple distribution still needs a $99/yr Apple Developer account for
  TestFlight/App Store (planned as Android-first for demos).
- **Escape hatch:** Expo supports `expo prebuild` / development builds to add
  custom native code without fully ejecting, so this decision is reversible if
  a required native module isn't Expo-compatible.
