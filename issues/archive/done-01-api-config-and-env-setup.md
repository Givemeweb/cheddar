## Parent

[PRD: Voice-to-Transaction Feature](/prd/voice-to-transaction.md)

## What to build

Create the API configuration module and environment setup for the voice-to-transaction feature. This slice establishes the foundation that all other slices depend on.

Specifically:
- Create `.env.example` with `EXPO_PUBLIC_API_URL` pointing to the backend extraction endpoint
- Create `src/config/api.ts` that reads `process.env.EXPO_PUBLIC_API_URL` and exports the full `POST /api/v1/transcriptions/extract` endpoint URL, with a fallback to `http://localhost:3000/api/v1` for local development
- Add voice recording translation keys to `src/i18n/en.json` under a new `voice` namespace, covering: tap-to-record, listening, uploading, extracting, cancel, stop, no-transaction-detected, processing-error, retry, microphone-permission-required, open-settings
- Install `expo-av` via `npx expo install expo-av`

This slice contains no user-facing behavior yet, but it must compile and the config module must return the correct endpoint URL when imported.

## Acceptance criteria

- [ ] `.env.example` exists with `EXPO_PUBLIC_API_URL` documented
- [ ] `src/config/api.ts` exports `EXTRACTION_ENDPOINT` that reads from `EXPO_PUBLIC_API_URL`
- [ ] `src/i18n/en.json` contains all voice recording translation keys
- [ ] `expo-av` is installed and listed in `package.json`
- [ ] App compiles successfully (`npm start` or `npx expo start` runs without errors)
- [ ] Importing `EXTRACTION_ENDPOINT` returns the correct URL based on the env var

## Blocked by

None - can start immediately
