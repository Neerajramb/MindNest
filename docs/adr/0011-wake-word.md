# ADR-0011: "MindNest" wake word through on-device speech recognition in a development build

- Status: Accepted
- Date: 2026-10-11

## Context

Patients should be able to say "MindNest" (or "Hey MindNest") and a question without touching the phone. Listening
for a name all the time needs a speech recogniser running on the phone. Expo Go includes no such module, and sending
continuous room audio to the server or Gemini would be slow, costly and a privacy problem (ADR-0006: only synthetic
data on the free tier).

## Decision

Use `expo-speech-recognition` (the platform recognisers: Apple Speech on iOS, Google on Android) in continuous mode,
biased towards "MindNest", preferring on-device recognition when the phone supports it. Text after the name is sent to
the existing `/assistant/query` endpoint, so the wake word answers exactly what the "Ask me" tab answers.

- Listens only while the patient app is in the foreground (iOS does not allow background wake words).
- Steps aside while another screen records (`features/mic-hold.ts`) and while MindNest is answering, so it does not
  hear itself.
- On by default for patients, with a switch in Settings; the Home screen shows "Say 'MindNest'" while it listens.
- Loaded only outside Expo Go; in Expo Go the app works as before and Settings explains why the switch is disabled.

This requires leaving Expo Go for a development build (EAS profile `development` in `mobile/eas.json`), which
supersedes ADR-0002's "only Expo Go-compatible modules during development". The Android build is free on EAS; an
iPhone build needs a paid Apple Developer account.

## Alternatives rejected

- Streaming short clips to the laptop and spotting the name with a local Whisper model: works in Expo Go but is slower,
  misses the word at clip boundaries, drains battery and depends on the laptop.
- Picovoice Porcupine: dedicated wake-word engine, but needs an account and access key and still a development build.

## Consequences

When the phone has no offline model for the language, the platform recogniser may process audio online (Apple or
Google). Android 12 and older do not support continuous recognition, so the recogniser restarts after each utterance
(with the system beep).
