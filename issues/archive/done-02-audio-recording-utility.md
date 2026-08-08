## Parent

[PRD: Voice-to-Transaction Feature](/prd/voice-to-transaction.md)

## What to build

Create a deep utility module that encapsulates all audio recording concerns using `expo-av`. This module hides the complexity of microphone permissions, platform-specific recording formats, timer management, and cleanup behind a simple, stable API.

The module should expose:
- `requestMicrophonePermission(): Promise<boolean>` — requests mic permission and returns true if granted
- `startRecording(): Promise<void>` — configures and starts recording with platform-specific settings (`.m4a` AAC on iOS, `.webm` Opus on Android/web), begins a 30-second auto-stop timer
- `stopRecording(): Promise<{ uri: string; duration: number }>` — stops recording, returns the audio file URI and duration in milliseconds
- `cancelRecording(): Promise<void>` — stops and discards the current recording without returning a URI

The module must handle:
- Permission denial gracefully (return false, don't crash)
- Platform differences in recording format and quality settings
- Timer cleanup if recording is stopped manually before 30 seconds
- Recording instance cleanup to prevent memory leaks
- App going to background during recording (stop recording gracefully)

## Acceptance criteria

- [ ] `startRecording` + `stopRecording` produces a playable audio file on iOS (`.m4a`)
- [ ] `startRecording` + `stopRecording` produces a playable audio file on Android (`.webm`)
- [ ] Recording automatically stops after 30 seconds
- [ ] `cancelRecording` stops and discards without producing a file
- [ ] Permission request returns correct boolean based on user response
- [ ] No memory leaks or orphaned recording instances after multiple start/stop cycles
- [ ] Backgrounding the app during recording stops it gracefully

## Blocked by

- #1 API Configuration & Environment Setup (needs `expo-av` installed)
