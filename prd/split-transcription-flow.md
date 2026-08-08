# PRD: Split Voice-to-Transaction into Two-Step Transcription Flow

## Problem Statement

The current voice-to-transaction flow sends the audio file directly to `/transcriptions/extract`, which handles both transcription and structured extraction in a single backend call. The backend is being updated to split this into two separate endpoints: `/transcriptions` (audio → text) and `/transcriptions/extract` (text → structured transaction). The frontend must be updated to call both endpoints sequentially, display the raw transcription to the user, and then proceed to extraction. Without this change, the voice feature will break when the backend deprecates the single-step endpoint.

## Solution

Update the voice-to-transaction flow to make two sequential API calls. First, send the audio to `POST /api/v1/transcriptions` and receive the raw text. Display the transcription text in the recording modal immediately, then automatically proceed to call `POST /api/v1/transcriptions/extract` with the transcription string (instead of the audio file) to extract structured transaction data. The user sees a clear two-step progress indicator: "Transcribing..." → transcription text → "Extracting..." → result.

## User Stories

1. As a Cheddar user, I want the app to transcribe my voice note first and show me the text, so that I know what the AI heard before it extracts the transaction.
2. As a Cheddar user, I want to see "Transcribing..." while my audio is being converted to text, so that I know the app is working.
3. As a Cheddar user, I want the transcription text to remain visible while the app extracts the transaction, so that I have context about what is being processed.
4. As a Cheddar user, I want the app to clean up the audio file as soon as transcription is complete, so that my device storage is not wasted.
5. As a Cheddar user, I want clear error messages that tell me whether transcription failed or extraction failed, so that I understand what went wrong.
6. As a Cheddar user, if the transcription step fails, I want to be able to retry by re-recording my voice note, so that I can recover from temporary issues.
7. As a Cheddar user, if the extraction step fails, I want to be able to retry by re-recording my voice note, so that I can recover from temporary issues.
8. As a Cheddar user, I want the voice recording modal to feel seamless during the two-step process, so that the transition from transcription to extraction is smooth and natural.
9. As a developer, I want the transcription API call isolated in its own service module, so that it can be tested and maintained independently from extraction.
10. As a developer, I want the extraction service to accept a transcription string instead of an audio URI, so that the interface clearly reflects the two-step architecture.
11. As a developer, I want the modal's phase state machine to include a dedicated "transcribed" phase, so that the UI logic for showing transcription text is explicit and testable.
12. As a developer, I want the audio file deleted immediately after successful transcription, so that storage cleanup is deterministic and not tied to the end of the entire flow.
13. As a developer, I want both API endpoints to derive from the same base URL configuration, so that environment management remains simple.
14. As a developer, I want the extraction request to continue using multipart/form-data for consistency with the existing backend contract, even though it no longer contains a binary file.

## Implementation Decisions

### Module Architecture

We will introduce **one new deep module** and **modify three existing modules**:

1. **`transcription` service (deep, new)** — Encapsulates the audio-to-text API call to `POST /api/v1/transcriptions`. It sends the audio file as multipart/form-data, parses the `text/plain` response, and returns the raw transcription string. Its public interface is:

   ```ts
   function transcribeAudio(audioUri: string): Promise<string>;
   ```

   This is a deep module because it hides all HTTP concerns (multipart construction, MIME type detection, response parsing, error handling) behind a single string-in/string-out interface.

2. **`voice-extraction` service (deep, modified)** — Updated to accept a transcription string instead of an audio URI. The `ExtractionRequest` interface changes from `{ audioUri: string, ... }` to `{ transcription: string, ... }`. The service builds a multipart/form-data request where the `transcription` field is a plain string (matching the pattern of the existing JSON-stringified `accounts`, `categories`, and `recentNotes` fields). Its public interface becomes:

   ```ts
   interface ExtractionRequest {
     transcription: string;
     accounts: Array<{ id: string; name: string }>;
     categories: Array<{ id: string; name: string }>;
     recentNotes: Array<{ id: string; text: string }>;
     recordedAt: Date;
   }

   function extractTransaction(request: ExtractionRequest): Promise<ExtractionResponse>;
   ```

   This remains a deep module because it continues to centralize all extraction HTTP concerns.

3. **`VoiceRecorderModal` component (deep, modified)** — The modal's internal state machine gains a new `"transcribed"` phase. The `processAudio` flow is split into two sequential steps:
   - Step 1: Call `transcribeAudio(audioUri)` → transition to `"transcribed"` phase (display text) → delete audio file.
   - Step 2: Immediately call `extractTransaction({ transcription, ... })` → transition `"transcribed"` phase shows text above the "Extracting..." spinner.
   - The `loadingStatus` enum changes from `"uploading" | "extracting"` to `"transcribing" | "extracting"`.
   - Error handling distinguishes between transcription failures and extraction failures, each with its own localized message. On any failure, the user must start over from recording (the modal resets to `"idle"`).

4. **`api-config` module (shallow, modified)** — Add a `TRANSCRIPTION_ENDPOINT` export alongside the existing `EXTRACTION_ENDPOINT`, both derived from the same `EXPO_PUBLIC_API_URL` base.

5. **i18n translations (shallow, modified)** — Update the `voice` namespace:
   - Replace `"uploading"` with `"transcribing"`.
   - Add `"transcriptionFailed"` for transcription-step errors.
   - Add `"extractionFailed"` for extraction-step errors.

### API Contracts

**Endpoint 1: `POST /api/v1/transcriptions`**
- Request: `multipart/form-data` with `file` (binary audio).
- Query params: optional `timestamps` (boolean), optional `language` (2-letter ISO code).
- Response: `text/plain` — raw transcription string.
- Errors: 400 (validation), 413 (file too large), 429 (rate limit), 500 (service error).

**Endpoint 2: `POST /api/v1/transcriptions/extract`**
- Request: `multipart/form-data` with fields:
  - `transcription` (plain string)
  - `accounts` (JSON string)
  - `categories` (JSON string)
  - `recentNotes` (JSON string)
  - `recordedAt` (ISO 8601 string)
- Response: `application/json` with `{ transcription: string, transaction: object }`.
- Errors: 400 (validation), 413 (file too large — though no file is sent, kept for backward compatibility), 429 (rate limit), 500 (extraction error).

### Audio File Lifecycle

The audio file is created during recording and deleted immediately after `transcribeAudio()` resolves successfully. If transcription fails, the file is deleted during error cleanup. The file is never present during the extraction step.

### UI Flow

| Phase | Visual |
|-------|--------|
| `idle` | Mic button, "Tap to record" |
| `recording` | Pulsing mic, waveform bars, "Listening..." |
| `transcribed` | Transcription text displayed, "Extracting..." spinner below it |
| `loading` (with `transcribing` status) | Spinner, "Transcribing..." |
| `error` | Error message, user must dismiss and re-record |

The `"transcribed"` phase is transient — it appears the moment transcription returns and persists until extraction completes. There is no user confirmation or delay; extraction starts immediately.

### Error Differentiation

- Transcription errors (network, non-200, parse failure) show `"transcriptionFailed"`.
- Extraction errors (network, non-200, parse failure) show `"extractionFailed"`.
- In both cases, the modal resets to `"idle"` and the user must tap the mic button to re-record.

## Testing Decisions

### What Makes a Good Test

Tests should verify **external behavior**, not implementation details. For the `transcription` service, this means asserting that `transcribeAudio(uri)` returns the expected string given a mocked `fetch` response — not that it constructs FormData in a specific way. For the `voice-extraction` service, this means asserting that `extractTransaction({ transcription, ... })` returns the expected parsed response — not that it stringifies arrays internally. For the `VoiceRecorderModal`, this means asserting the full user flow through phase transitions — not that specific internal state variables change.

### Modules to Test

1. **`transcription` service** — Mock `fetch` to return controlled `text/plain` responses. Test: successful transcription, network error, non-200 HTTP error, malformed response.
2. **`voice-extraction` service** — Mock `fetch` to return controlled JSON responses. Test: successful extraction with `transcription` field, network error, malformed JSON, missing fields. Verify that the request body contains `transcription` as a string field, not `file`.
3. **`VoiceRecorderModal`** — Use React Native Testing Library to test the updated flow: open modal → start recording → stop → transcribe API called → "transcribed" phase renders text → extract API called → extraction result → navigation. Also test: transcription error shows correct message and resets to idle, extraction error shows correct message and resets to idle.

### Prior Art

The codebase does not currently have unit tests. Follow Expo/React Native testing conventions using `@testing-library/react-native` and `jest`. Mock `fetch`, `expo-router`, and `expo-file-system` modules in tests.

## Out of Scope

- **Backend changes** — The backend endpoints are assumed to already exist per the provided API docs. This PRD only covers frontend integration.
- **User editing of transcription text** — The transcription is displayed as read-only. Editing is deferred to a future iteration.
- **Retry of individual steps** — If transcription succeeds but extraction fails, the user must re-record. Retry of just the extraction step is deferred.
- **Streaming or real-time transcription** — Both endpoints are request/response.
- **Language selection** — The `language` query param on `/transcriptions` is not exposed in the UI. The backend handles auto-detection.
- **Timestamps** — The `timestamps` query param on `/transcriptions` is not exposed in the UI.
- **Persistent storage of transcriptions** — Transcription text is ephemeral, held only during the modal session.

## Further Notes

- The `/transcriptions` endpoint returns `text/plain`, not JSON. The service must use `response.text()`, not `response.json()`.
- The `transcription` field in the extraction multipart request is a plain string, consistent with how `accounts`, `categories`, and `recentNotes` are sent as JSON strings. The backend parses all form fields as strings.
- The existing `ExtractionRequest` interface name is preserved (not renamed) per the developer's preference, but its `audioUri` field is replaced with `transcription`.
- The waveform visualization and pulsing mic animation remain unchanged during recording. The new `"transcribed"` phase does not include animations — it is a brief transitional display.
- The `recordedAt` timestamp continues to be sent to the extraction endpoint as the reference date for resolving relative date expressions.
