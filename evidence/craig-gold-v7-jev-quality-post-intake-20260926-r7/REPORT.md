# r7 Jev quality

Deployed build `6bee4be55b243482b1b44ee2f74ec3a0f5f466c5` on https://vacation-staging.timesyncher.com (deployment timesyncher-vacation-staging-aez16cuhf). Live hash matched that tip before the drive. Both PDFs are stamped with that build.

Function count: 1 (`api/[...route].func`).

Local curls: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

Live curls: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

Timing in the dialog PDF is labeled as gen-only versus real per-turn latency. Gen-only p50 is 4039ms. Real per-turn latency p50 is 6050ms. Session elapsed is 186570ms.

Every rewrite attempt logged a T1 interim. Failed rewrites shipped the draft, set the flag, and logged the reason. Rewrite text, rewrite model, Jev rewrite score, and the true draft are on those turns. No rewrite score was stored as 0. A draft scoring 4 or more shipped as-is. Seat prices are Kimberly $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren.

The shared itinerary holds the Sunday garden on Apr 5, the Thursday town walk on Apr 9, and the Friday dinner plus the later swim on Apr 10. Ratings and reviews are blank. Autonomy, voice, and Telegram intake are gaps. The day-chip slider and the guest navigation panel are real captures.

The purchase email on this build first opened `/shared/` without the intake slug. The captured copy uses the shared intake path. Collaborator invites and the Tyler and Lauren welcomes are in the journey.

Hold certify. No merge.
