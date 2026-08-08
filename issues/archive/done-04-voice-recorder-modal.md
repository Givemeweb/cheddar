## Parent

[PRD: Voice-to-Transaction Feature](/prd/voice-to-transaction.md)

## What to build

Create the immersive voice recording modal component that manages the full user flow from permission check through recording, upload, and result handling. This is the primary user-facing piece of the voice-to-transaction feature.

The modal follows the "Precision Audio" aesthetic: a dark, near-black background with a subtle cheddar-yellow radial glow behind the microphone. The interface has three phases:

1. **Recording Phase**: Large circular microphone button (120px) with a pulsing amber ring that breathes while recording. Small waveform visualization (5–7 thin vertical bars) animates around the mic. Status text reads "Listening...". A minimal X cancel button in the top-right. Auto-stops after 30 seconds.

2. **Loading Phase**: Full-screen blocking overlay with a spinner and status text that transitions: "Uploading..." → "Extracting...". No user interaction possible.

3. **Result Phase**: On success, the modal calls `onResult` with pre-filled transaction params and dismisses. On `type === "unknown"`, shows a toast "No transaction detected. Please fill in the details manually." and dismisses. On error, shows an alert with "Failed to process audio. Please check your connection and try again." with Retry and Cancel buttons.

The component accepts:
- `visible: boolean` — controls modal visibility
- `onResult: (params: AddTransactionParams | null) => void` — called with extracted params or null
- `onClose: () => void` — called when modal dismisses

Internal flow:
- Check mic permission on open → if denied, show permission alert with "Open Settings" button
- Tap mic button → start recording → show pulsing ring + waveform bars
- Tap stop or auto-stop → show loading overlay → call `voiceExtraction.extractTransaction()` → handle result → call `onResult` or show error → delete local audio file → dismiss
- Tap cancel during recording → stop and discard → dismiss

Animations:
- Modal open: fade-in
- Mic button: spring scale from 0.8 to 1.0 on recording start
- Waveform bars: random height animation cycling during recording
- Pulsing ring: scale + opacity oscillation using `Animated`

Background handling:
- Listen to `AppState` changes — if app goes to background during recording, stop recording gracefully

## Acceptance criteria

- [ ] Modal opens with fade animation when mic FAB is tapped
- [ ] Recording starts on mic button tap, pulsing ring and waveform bars animate
- [ ] Cancel button stops and discards recording, modal dismisses
- [ ] Auto-stop after 30 seconds triggers upload flow
- [ ] Loading overlay shows "Uploading..." then "Extracting..."
- [ ] On success, `onResult` is called with correct pre-filled params
- [ ] On `type === "unknown"`, toast is shown and modal dismisses
- [ ] On API error, alert with Retry/Cancel is shown
- [ ] Permission denied shows alert with "Open Settings" button
- [ ] App backgrounding during recording stops gracefully
- [ ] Local audio file is deleted after upload (success or error)
- [ ] All user-facing text uses i18n translation keys

## Blocked by

- #2 Audio Recording Utility (needs recording functions)
- #3 Voice Extraction Service (needs API call function)
