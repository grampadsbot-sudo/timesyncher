# Revert trip 99 places 664 / 669 / 672 (Neon)

1. Run `J/trip99-backup.sql` against Neon and save the result JSON to a timestamped file under host backups.
2. Restore from that backup with inverse `UPDATE` statements for `places` rows `trip_id = 99` and `id IN (664, 669, 672)`.
3. Re-run dossier overlay fill for those thing ids if evidence dossier payloads were changed on host.
4. Re-pull `scripts/fixtures/gate-b-nyc-shared-staging.json` from live only after live rows match the reverted names.
