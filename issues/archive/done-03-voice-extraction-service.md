## Parent

[PRD: Voice-to-Transaction Feature](/prd/voice-to-transaction.md)

## What to build

Create a deep service module that handles the API call to the backend extraction endpoint. This module builds a multipart form request containing the audio file plus JSON-serialized user context, sends it to `POST /api/v1/transcriptions/extract`, and parses the structured transaction response.

The module should expose:
- `extractTransaction(request: ExtractionRequest): Promise<ExtractionResponse>`

Where `ExtractionRequest` contains:
- `audioUri: string` — local path to the recorded audio file
- `accounts: Array<{ id: string; name: string }>` — user's accounts for context
- `categories: Array<{ id: string; name: string }>` — user's categories for context
- `recentNotes: Array<{ id: string; text: string }>` — last 20 unique transaction notes
- `recordedAt: Date` — timestamp when recording started (for relative date resolution)

And `ExtractionResponse` contains:
- `transcription: string` — raw transcribed text
- `transaction: { type, amount, account, from, to, category, note, date }` — structured fields

The module must handle:
- Building multipart form data with the audio file blob and JSON string fields
- Network errors (throw with clear message)
- Non-200 HTTP responses (throw with status code)
- Malformed JSON responses (throw with parse error)
- Missing or unexpected fields in response (graceful fallback)

## Acceptance criteria

- [ ] `extractTransaction` builds a valid multipart form request with audio + context
- [ ] Returns parsed `ExtractionResponse` on 200 OK
- [ ] Throws clear error on network failure
- [ ] Throws clear error on non-200 HTTP response
- [ ] Throws clear error on malformed JSON response
- [ ] Audio file is NOT deleted by this module (caller responsibility)
- [ ] Works with the endpoint URL from `src/config/api.ts`

## Blocked by

- #1 API Configuration & Environment Setup (needs API config module)
