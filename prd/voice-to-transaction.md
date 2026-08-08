# PRD: Voice-to-Transaction Feature

## Problem Statement

Users currently must manually type every transaction detail (amount, category, account, note, date) into the add-transaction form. This is tedious, especially for frequent small transactions like "coffee $4.50" or "gas $45". There is no way to create a transaction by simply speaking. The backend already supports extracting structured transaction data from audio via `POST /api/v1/transcriptions/extract`, but the frontend has no voice recording capability or integration with this endpoint.

## Solution

Add a microphone button to the transactions screen that opens an immersive voice recording modal. When the user records a voice note and stops, the app uploads the audio to the backend extraction endpoint along with the user's accounts, categories, and recent notes as context. The backend transcribes the audio and uses an LLM to extract structured transaction fields (type, amount, account, category, note, date). The app then navigates to the add-transaction screen with all extracted fields pre-filled, allowing the user to review and save with minimal friction.

## User Stories

1. As a Cheddar user, I want to tap a microphone button to start recording a voice note, so that I can create a transaction without typing.
2. As a Cheddar user, I want to see a clear visual indicator that recording is in progress, so that I know the app is listening.
3. As a Cheddar user, I want to cancel a recording before stopping it, so that I can abort if I made a mistake or changed my mind.
4. As a Cheddar user, I want the recording to automatically stop after 30 seconds, so that I don't accidentally create huge audio files.
5. As a Cheddar user, I want the app to extract the amount I spoke from my voice note, so that I don't have to type it manually.
6. As a Cheddar user, I want the app to understand relative dates like "yesterday" or "last Tuesday" from my voice note, so that transactions are dated correctly.
7. As a Cheddar user, I want the app to match my spoken transaction to one of my existing categories, so that my spending reports remain organized.
8. As a Cheddar user, I want the app to recognize which account I mentioned and link the transaction to it, so that my account balances stay accurate.
9. As a Cheddar user, I want the app to recognize transfers between my accounts (e.g., "moved $100 from checking to savings"), so that both accounts are updated correctly.
10. As a Cheddar user, I want the app to suggest a relevant note from my recent history if I mention something similar, so that I can maintain consistent descriptions.
11. As a Cheddar user, I want the app to handle non-financial voice notes gracefully (e.g., "What's the weather?") by showing me a message and letting me fill in details manually, so that the app doesn't crash or reject my input.
12. As a Cheddar user, I want the extraction to happen quickly after I stop recording, so that I get feedback within a few seconds.
13. As a Cheddar user, I want the add-transaction form to be pre-filled with all extracted fields after voice recording, so that I only need to review and tap save.
14. As a Cheddar user, I want the voice recording experience to feel premium and immersive, with smooth animations and a dark, focused interface, so that I enjoy using the feature.
15. As a Cheddar user, I want the microphone button to be visually distinct from the existing add-transaction button, so that I can easily tell them apart.
16. As a Cheddar user, I want to be prompted for microphone permissions the first time I use the feature, with a clear explanation of why it's needed, so that I can grant access confidently.
17. As a Cheddar user, if I deny microphone permissions, I want to be able to open my device settings to grant them later, so that I'm not permanently blocked from the feature.
18. As a Cheddar user, I want the app to show clear loading states while my voice note is being processed (uploading, extracting), so that I know something is happening and the app hasn't frozen.
19. As a Cheddar user, I want to be able to retry if the API call fails, so that I don't lose my recording due to a temporary network issue.
20. As a Cheddar user, I want all UI text related to voice recording to be localized, so that the feature feels native in my language.
21. As a developer, I want the voice recording logic isolated in a reusable module, so that I can test it independently and reuse it elsewhere.
22. As a developer, I want the API endpoint URL configurable via environment variable, so that I can point to different backends (dev, staging, prod) without code changes.
23. As a developer, I want the audio file cleaned up after upload, so that the app doesn't accumulate unused audio files in storage.
24. As a developer, I want the backend to receive the user's accounts, categories, and recent notes as context, so that the LLM can make accurate extraction decisions based on the user's actual data.

## Implementation Decisions

### Module Architecture

We will introduce **three deep modules** and **modify two shallow modules**:

1. **`audio-recording` utility (deep)** — Encapsulates all audio recording concerns using `expo-av`: requesting microphone permissions, configuring platform-specific recording settings (`.m4a` on iOS, `.webm` on Android/web), starting/stopping recording, handling the 30-second auto-stop timer, and cleaning up the recording instance. Its public interface is:

   ```ts
   interface AudioRecordingResult {
     uri: string;
     duration: number; // milliseconds
   }

   function requestMicrophonePermission(): Promise<boolean>;
   function startRecording(): Promise<void>;
   function stopRecording(): Promise<AudioRecordingResult>;
   function cancelRecording(): Promise<void>;
   ```

   This is a deep module because it hides the complexity of `expo-av` configuration, platform differences, permission flows, and timer management behind a simple, stable API.

2. **`voice-extraction` service (deep)** — Encapsulates the API call to the backend extraction endpoint. It builds a multipart form request containing the audio file plus JSON-serialized context data (accounts, categories, recentNotes, recordedAt), sends it to `POST /api/v1/transcriptions/extract`, and parses the response. Its public interface is:

   ```ts
   interface ExtractionRequest {
     audioUri: string;
     accounts: Array<{ id: string; name: string }>;
     categories: Array<{ id: string; name: string }>;
     recentNotes: Array<{ id: string; text: string }>;
     recordedAt: Date;
   }

   interface ExtractionResponse {
     transcription: string;
     transaction: {
       type: 'income' | 'expense' | 'transfer' | 'unknown';
       amount: number | null;
       account: string | null;
       from: string | null;
       to: string | null;
       category: string | null;
       note: string | null;
       date: string | null; // ISO 8601
     };
   }

   function extractTransaction(request: ExtractionRequest): Promise<ExtractionResponse>;
   ```

   This is a deep module because it centralizes all HTTP concerns (multipart construction, error handling, response parsing, ID validation) in one place.

3. **`VoiceRecorderModal` component (deep)** — The immersive recording UI. It manages the full user flow: permission check → recording UI (pulsing mic, waveform bars, cancel button) → loading overlay (uploading/extracting) → result handling (navigate to pre-filled form or show toast). It consumes the `audio-recording` utility and `voice-extraction` service. Its public interface is a single boolean `visible` prop and an `onResult` callback:

   ```ts
   interface VoiceRecorderModalProps {
     visible: boolean;
     onResult: (params: AddTransactionParams | null) => void;
     onClose: () => void;
   }
   ```

   This is a deep module because it encapsulates the entire voice-to-transaction user journey — state machine, animations, error handling, navigation — behind a simple modal interface.

4. **`FAB` component (shallow)** — Modified to render two stacked FABs: the existing plus FAB (bottom) and a new microphone FAB (above it). The microphone FAB opens the `VoiceRecorderModal`. This is shallow because it delegates all recording logic to the modal.

5. **`api-config` module (shallow)** — Reads `EXPO_PUBLIC_API_URL` from environment variables and exports the full extraction endpoint URL. This is shallow because it contains no logic, just configuration.

### Aesthetic Direction: "Precision Audio"

The recording modal is a dark, immersive, single-focus interface. Background is near-black with a subtle radial glow behind the microphone in cheddar-yellow, creating a "spotlight on the mic" effect. The microphone button is large (120px), circular, with a pulsing amber ring that breathes while recording. A small waveform visualization (5–7 thin vertical bars) animates around the mic to show active recording. Status text is large, centered, with generous letter-spacing. The cancel button is a minimal X in the top-right corner. Transitions use smooth fade-in and spring-scale animations.

### Platform-Specific Recording Formats

- **iOS**: Record as `.m4a` (AAC) — native, reliable, small files. Backend accepts `audio/x-m4a`.
- **Android**: Record as `.webm` (Opus) — native support, small files. Backend accepts `audio/webm`.
- **Web**: Record as `.webm` (Opus) — standard Web Audio API output. Backend accepts `audio/webm`.

### Context Data Serialization

The extraction request includes three JSON string fields in the multipart form:

- **`accounts`**: All user accounts as `{ id, name }` array. The backend matches spoken account names against these.
- **`categories`**: All user categories as `{ id, name }` array. The backend matches spoken category names against these.
- **`recentNotes`**: Last 20 unique non-empty transaction notes as `{ id, text }` array. The backend uses these for note suggestion.
- **`recordedAt`**: ISO 8601 timestamp of when recording started. The backend uses this as the reference date for resolving relative expressions like "yesterday".

### Pre-filled Form Navigation

When extraction succeeds with `type !== "unknown"`, the modal constructs URL params for `add-transaction` and passes them via `router.push`. The params map directly to the `add-transaction` screen's existing `useLocalSearchParams`:

| Param | Source |
|-------|--------|
| `type` | `transaction.type` |
| `amount` | `transaction.amount` as string |
| `note` | `transaction.note` |
| `date` | `transaction.date` (ISO string) |
| `accountId` | `transaction.account` (validated against local accounts) |
| `categoryId` | `transaction.category` (validated against local categories) |
| `fromAccountId` | `transaction.from` (for transfers) |
| `toAccountId` | `transaction.to` (for transfers) |

If `type === "unknown"`, the modal shows a toast message and dismisses without navigating. The user can manually navigate to add-transaction if desired.

### Error Handling & Resilience

- **Permission denied**: Show alert explaining microphone need + "Open Settings" button.
- **Recording fails**: Show alert with error message, allow retry.
- **API network error**: Show alert "Failed to process audio. Please check your connection and try again." with Retry/Cancel buttons.
- **API returns non-200**: Show generic error alert with Retry/Cancel.
- **Malformed response**: Treat as unknown transaction, show toast.
- **Hallucinated IDs**: The backend validates returned IDs against provided lists and treats invalid ones as `null`. The frontend additionally validates IDs against local data before pre-filling.

### Environment Configuration

Create `.env.example` with:

```
EXPO_PUBLIC_API_URL=https://your-backend.com/api/v1
```

The `api-config` module reads `process.env.EXPO_PUBLIC_API_URL` (Expo SDK 49+ built-in support) and falls back to `http://localhost:3000/api/v1` for local development.

### Localization

Add a new `voice` namespace to the existing i18n translation file (`src/i18n/en.json`) with keys for all user-facing strings in the recording modal, loading states, error messages, and permission prompts.

## Testing Decisions

### What Makes a Good Test

Tests should verify **external behavior**, not implementation details. For the `audio-recording` utility, this means asserting that calling `startRecording` followed by `stopRecording` returns a valid audio URI — not that it uses `expo-av` internally. For the `voice-extraction` service, this means asserting that given an audio URI and context data, it returns the expected extraction response — not that it uses `fetch` internally. For the `VoiceRecorderModal`, this means asserting user interactions (tap mic → recording starts → tap stop → API called → navigation happens) — not that specific internal state variables change.

### Modules to Test

1. **`audio-recording` utility** — Test permission request (mock `expo-av` permissions API), recording lifecycle (mock `Audio.Recording` class), auto-stop timer, and cancel behavior.
2. **`voice-extraction` service** — Mock `fetch` to return controlled responses. Test: successful extraction, network error, malformed JSON, missing fields.
3. **`VoiceRecorderModal`** — Use React Native Testing Library to test the full user flow: open modal → grant permission → start recording → stop → API success → navigation with correct params. Also test: cancel during recording, API error with retry, unknown transaction type.

### Prior Art

The codebase does not currently have unit tests. Follow Expo/React Native testing conventions using `@testing-library/react-native` and `jest`. Mock `expo-av` and `expo-router` modules in tests.

## Out of Scope

- **Backend implementation** — The backend endpoint `POST /api/v1/transcriptions/extract` is already live per the existing backend PRD. This PRD only covers frontend integration.
- **Multi-transaction audio** — If a user mentions multiple transactions in one clip, the backend extracts a single combined transaction. Splitting transactions is deferred.
- **Currency conversion** — Amounts are returned as plain numbers. Currency detection and conversion are not implemented.
- **Persistent storage of voice notes** — Audio files are deleted immediately after upload. No voice note history is kept.
- **Real-time streaming** — The endpoint is request/response, not streaming.
- **Voice activity detection / audio preprocessing** — The frontend sends raw recorded audio without preprocessing.
- **Subcategory extraction** — The backend does not return subcategory IDs. Subcategories must be selected manually in the pre-filled form.
- **Image attachment via voice** — Voice notes cannot attach images. Images must be added manually in the form.

## Further Notes

- The `expo-av` library must be installed via `npx expo install expo-av` to ensure compatible native module versions.
- The microphone FAB should be visually distinct from the plus FAB while maintaining brand consistency. Consider using the same cheddar-yellow background but with a `Mic` icon instead of `+`.
- The waveform visualization can be implemented with simple `Animated.View` bars that randomize height periodically during recording. No actual audio analysis is needed — it's a visual affordance.
- Consider adding haptic feedback (via `expo-haptics`) on start/stop recording in a future iteration for extra tactile polish.
- The `VoiceRecorderModal` should use React Native's `Modal` component with `animationType="fade"` for the open/close transition, and internal `Animated` API for the mic button spring scale and waveform bar animations.
- The recording modal should handle the case where the app goes to background during recording by stopping the recording gracefully (using `AppState` listener).
