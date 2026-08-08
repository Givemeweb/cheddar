## Parent

[PRD: Voice-to-Transaction Feature](/prd/voice-to-transaction.md)

## What to build

Integrate the voice recording modal into the existing FAB component on the transactions screen, completing the end-to-end user flow from mic tap to pre-filled transaction form.

Modify `src/components/FAB.tsx` to render two stacked FABs at the bottom-right:
- **Top**: New microphone FAB — same size (56px), same cheddar-yellow background, but with a `Mic` icon from `lucide-react-native` instead of `+`. Tapping opens the `VoiceRecorderModal`.
- **Bottom**: Existing plus FAB — unchanged behavior (navigates to `/add-transaction`).

The two FABs should be vertically stacked with ~16px spacing between them.

Wire the microphone FAB to the modal:
- On tap: set modal `visible` to true
- On modal `onResult`: if params are provided, navigate to `/add-transaction` with pre-filled URL params (`type`, `amount`, `note`, `date`, `accountId`, `categoryId`, `fromAccountId`, `toAccountId`)
- On modal `onClose`: just close the modal

Pre-filled param mapping from extraction response:
- `type` → `type` (income/expense/transfer)
- `amount` → `amount` (absolute value as string)
- `note` → `note`
- `date` → `date` (ISO string)
- `account` → `accountId` (validated against local accounts)
- `category` → `categoryId` (validated against local categories)
- `from` → `fromAccountId` (for transfers)
- `to` → `toAccountId` (for transfers)

ID validation: before passing IDs in URL params, verify they exist in the user's local accounts/categories. If the backend returns an ID not present locally (e.g., hallucinated or from stale data), treat it as null.

Error handling:
- If modal returns null (unknown transaction): show toast "No transaction detected. Please fill in the details manually." — user stays on transactions screen
- If modal signals an error: alert is already shown inside the modal, no additional action needed

The existing plus FAB behavior must remain unchanged.

## Acceptance criteria

- [ ] Two FABs are visible on the transactions screen: mic (top) and plus (bottom)
- [ ] Tapping mic FAB opens the voice recording modal
- [ ] Tapping plus FAB still navigates to blank `/add-transaction`
- [ ] After successful voice extraction, app navigates to `/add-transaction` with all fields pre-filled
- [ ] Pre-filled params correctly populate the form (type, amount, account, category, note, date)
- [ ] Transfer transactions pre-fill `fromAccountId` and `toAccountId`
- [ ] Invalid/hallucinated IDs from backend are treated as null (form shows "Select account/category")
- [ ] Unknown transaction type shows toast and stays on transactions screen
- [ ] The existing transaction list and month navigation remain fully functional
- [ ] Both FABs are visually distinct but consistent with brand colors

## Blocked by

- #4 Voice Recorder Modal UI (needs the modal component)
