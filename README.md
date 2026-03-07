# Interactive Notes

An AI-powered notes application that combines semantic search, real-time voice conversation, and live visual understanding into a single unified experience.

## What It Does

Interactive Notes lets you capture, search, and interact with your notes using text, voice, and camera input. Notes are stored as vector embeddings for intelligent semantic search, and you can have real-time audio conversations with an AI that has full context of your stored notes. A live camera feed powered by a Vision Language Model can describe, read, and analyze what it sees — and those observations become searchable notes too.

## Architecture Overview

The app is built around four core systems:

### Data Management (ChromaDB)

The backbone of the app. All notes — whether typed, transcribed from voice, or generated from camera input — flow into a ChromaDB vector database. Text is chunked, embedded, and stored with metadata (timestamps, tags, source type). Semantic search lets you find notes by meaning rather than exact keywords, with support for metadata filtering and hybrid search.

### Real-Time Audio (Gemini)

A live voice conversation system built on Gemini's multimodal API. Speak into the mic, and Gemini responds in real-time with full context from your stored notes. Voice activity detection handles when you start and stop talking, and interruptions are supported. All conversations are transcribed and stored back into the database automatically.

### Vision Language Model (VLM)

A live camera feed captures frames and sends them to a VLM for analysis. The model can describe scenes, read text in images, identify objects, and answer questions about what it sees. Smart frame selection avoids redundant API calls when the scene hasn't changed. All generated descriptions are stored in the database and become searchable.

### Frontend

The user-facing application tying everything together. Core screens include:

- **Dashboard** — Recent notes and quick actions
- **Notes View** — Browse, create, edit, and delete notes
- **Search** — Semantic search across all note types
- **Audio Conversation** — Real-time voice interaction with live transcription
- **Camera / VLM View** — Live camera feed with AI-generated overlays
- **Settings** — API keys, preferences, model selection

## Team Roles

| Role | Owner | Focus |
|------|-------|-------|
| Data Management | — | ChromaDB, embeddings, search, ingestion pipeline |
| Real-Time Audio | — | Gemini API, mic capture, streaming, transcription |
| Frontend | — | UI, navigation, feature integration, UX |
| VLM | — | Camera capture, vision model, image analysis |

## Key Integration Points

- **Audio <-> Data** — Transcript format for storage; pulling note context for Gemini calls
- **VLM <-> Data** — Image description format for storage; metadata schema for visual data
- **Frontend <-> Audio** — Real-time transcription and playback state via WebSocket/events
- **Frontend <-> VLM** — Camera frames and VLM responses passed to the UI
- **Frontend <-> Data** — API contract for search, CRUD on notes, listing collections
- **Audio <-> VLM** — Routing voice queries like "what do you see?" to the VLM with the current frame

## Helpful Links

- [Google AI Studio](https://ai.dev)
- [Google AI Studio Build](https://ai.dev/build)
- [Gemini API Documentation](https://ai.google.dev)
- [Antigravity (Google)](https://antigravity.google)
- [Stitch — UI Design](https://stitch.withgoogle.com/)
- [AfterQuery](https://www.afterquery.com/)
- [Overshoot AI](https://overshoot.ai/)
- [ChromaDB](https://www.trychroma.com/)
- [Browserbase](https://www.browserbase.com/)
