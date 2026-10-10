# ADR-0006: AI provider split: local face/embeddings, Gemini for LLM/vision/STT

- Status: Accepted
- Date: 2026-10-10

## Context

The specs prefer local processing and say cloud must not be mandatory. The user chose the Gemini free tier for the LLM. Gemini free-tier terms allow Google to use inputs for training and human review, and say not to submit personal information. Pretrained local detectors lack keys/wallet/glasses.

## Decision

Face detection and recognition run locally (OpenCV YuNet, MIT; SFace, Apache-2.0); biometric data never leaves the server. Text embeddings run locally (fastembed all-MiniLM-L6-v2). Gemini handles response generation, room-scan object detection and speech-to-text, behind provider interfaces (`LLM_PROVIDER=gemini|ollama|none`). **Only synthetic/demo data may be used with the free tier.**

## Alternatives rejected

Fully local stack (no time to train a detector or tune a local LLM in 3 days); Gemini for faces (biometric data off-device, policy risk).

## Consequences

The app works with no LLM for every structured feature (ADR-0007). Real patient data requires a paid tier with no-training terms, or the local providers.
