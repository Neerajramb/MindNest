# ADR-0002: React Native + Expo for the mobile client

- Status: Accepted
- Date: 2026-10-10

## Context

The app needs camera, audio recording, location, local notifications, secure storage, TTS and maps on Android and iOS. All inference runs on the server (ADR-0006), so no on-device ML runtime is needed. Development uses an iPhone with Expo Go; the demo uses an Android APK.

## Decision

Expo SDK 57, TypeScript (strict), Expo Router. During development only Expo Go-compatible modules are used. Server state uses TanStack Query.

## Alternatives rejected

Flutter (equally capable, but adds Dart with no offsetting benefit); native Kotlin/Swift (two codebases).

## Consequences

Background location and remote push need a development build later (see KNOWN_ISSUES).
