# MindNest — MCI Assistive App

An AI-powered multimodal assistive application for people with **Mild Cognitive Impairment (MCI)**.

## Problem

People living with MCI struggle with everyday memory tasks: remembering appointments and medication,
finding misplaced objects, recognising familiar people, and recalling recent conversations. Existing
support is spread across many disconnected apps, and caregivers have little visibility into how the
person they care for is doing.

## Objectives

MindNest is a single, privacy-preserving companion that combines smartphone capture (camera, audio, GPS)
with AI processing on a backend/local node to provide:

- **Routine support** — daily schedule, appointments, reminders and medication reminders
- **Object finding** — object detection and tracking that reports the *last observed* location of an item
- **Familiar-person recognition** — face recognition of people registered by the caregiver
- **Conversational memory** — speech-to-text, embeddings and RAG to recall past conversations in context
- **Personal AI assistant** — answers questions using the patient's schedule, data and retrieved memories
- **Safety** — GPS geofencing with caregiver alerts
- **Well-being** — relaxation, meditation and therapeutic audio
- **Caregiver dashboard** — patient management, monitoring, notifications and activity logs

The system states uncertainty instead of guessing. It never diagnoses, never changes medication or
dosage, and never claims an identity or location it is not confident about.

## Actors

| Actor | Role | Primary needs |
|---|---|---|
| **Patient** | Primary end user | Simple, low-cognitive-load assistance: reminders, memory cues, object finding, familiar-person recognition, schedule and conversational support |
| **Caregiver** | Remote support and configuration | Patient status, schedules, medications, safe zones, alerts, familiar-person registration, activity information |
| **AI/Backend System** | Processing layer | Receive multimodal input, run AI services, retrieve data, generate responses, trigger actions |
| **Notification Service** | Delivery mechanism | Deliver reminders, alerts and emergency notifications |

## Tech overview

- **Mobile app** (patient) and **caregiver dashboard**
- **Backend:** Django + REST API, authentication and role-based access control
- **AI services:** OpenCV / computer vision, face recognition, STT, embeddings + vector store, LLM/RAG

## Documentation

| Document | Location |
|---|---|
| Consolidated specification | [docs/specs/00_Consolidated_Specification.html](docs/specs/00_Consolidated_Specification.html) |
| Requirements, design, database, API, UI/UX, AI/RAG specs | [docs/specs/](docs/specs/) |
| Project milestones | [docs/Project_Milestones.html](docs/Project_Milestones.html) |
| UI wireframes | [docs/wireframes/](docs/wireframes/) |
