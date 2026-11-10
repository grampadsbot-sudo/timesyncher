# Revert trip 99 places 664 / 669 / 672 (Neon + TREK overrides)

1. Before applying, run `J/trip99-backup.sql` against Neon and save the result JSON to a timestamped file under host backups. Also save the full `thingOverrides["place:664"]`, `["place:669"]` and `["place:672"]` objects from `/api/shared/8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y` (pre-image) to the same backup folder.
2. To revert `places` and `reservations`: run inverse `UPDATE` statements from that backup for `trip_id = 99`, `places.id IN (664, 669, 672)` and `reservations.id IN (1464, 1469, 1472)`.
3. To revert overrides: write the saved pre-image override objects back for those three keys through the host's trip-99 override write path (`J/trip99-change.json` lists every key it sets or deletes).
4. Re-run dossier overlay fill for those thing ids if evidence dossier payloads were changed on host.
5. Re-pull `scripts/fixtures/gate-b-nyc-shared-staging.json` and `scripts/fixtures/nyc-screen-trip99-live-shared-api.json` from live only after live rows match the reverted names.
