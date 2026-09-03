# Keepsake PDFs

Keepsake PDFs are the customer-visible print and story artifacts for a vacation. This lever names the required files and stop rules; it does not render customer PDFs.

## Sub-features

- `keepsake-customer-flow` names the whole-experience screenshot / customer-flow PDF.
- `keepsake-customer-story` names the customer-story PDF with generated pictures.
- `keepsake-final` names the final keepsake PDF.
- `keepsake-removal-sync` requires removals to disappear from story and keepsake when those surfaces are in scope.

## How to get to it (user POV)

- Buy Photo Memories on checkout and later request the printable keepsake.
- Open the shared Journey / book export from the TREK trip.
- Inspect a verification receipt's `required_artifacts` list after a dry-run.

## Driving it with control-vacation

Preconditions:

- `node scripts/control-vacation.mjs doctor` exits `0`.
- A dry-run job exists under `artifacts/vacation-verify/`.

- **Named contracts.** Run `node scripts/control-vacation.mjs dry-run --fixture features/fixtures/successful-edit-wording.json --json`. `receipt.artifacts` exists and the compact receipt `required_artifacts` lists the three PDF contracts.
- **Read receipt.** Run `node scripts/control-vacation.mjs receipt --job-id vac-verify-successful-edit-wording`. The JSON names `final keepsake PDF`.
- **Removal in scope.** After `successful-edit-wording` apply, the after-snapshot no longer contains Bellagio Fountains. A later customer run must show the same absence in the customer-story and final keepsake PDFs.
- **Proof.** Keep the compact receipt. Do not generate a fake customer PDF and call the gate green.

## Gotchas

- This PR only names the PDF contracts. A missing PDF on a later customer run is a gate failure, not a reason to invent a file here.
- JourneyBook assets under `public/assets/` are TREK UI, not Vacation proof by themselves.
- Photo Memories checkout copy is not a keepsake PDF.
