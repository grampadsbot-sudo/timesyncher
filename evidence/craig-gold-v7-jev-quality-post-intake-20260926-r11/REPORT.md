# r11 Jev quality

Deployed build `463bfc8577a09b946207e81aeec3bc9016b3ba30` on https://vacation-staging.timesyncher.com (deployment timesyncher-vacation-staging-puvdty3xx). Live `/api/version` matches that tip. The dialog PDF and the screenshot journey are stamped with that build. Nothing was pushed onto `cursor/jev-quality-r5-1128` after that deploy.

Function count: 1 (`api/[...route].func`).

Local curls: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

Live curls: `GET /` 200, `GET /assets/index-BKun7ofk.js` 200, `GET /api/shared/las-vegas-vacation-3` 200, `GET /api/vacation-itinerary?app=1` 400, `GET /api/version` 200.

The purchase email shows `https://vacation-staging.timesyncher.com/shared/intake-3002f5087cbf/` as visible text. The initial itinerary in the journey is that live shared trip.

The dialog PDF was written. `scripts/live-transcript-dialog-pdf.mjs` exited 0. Status DONE. 49 turns. Two rewritten turns. Two rewrite labels. The price-line refusal did not fire.

Session wall time is 120526ms. Gen-only median is 3696ms. The v6 gen-only p50 of 28834ms is 7.80× this session's gen-only median. Real per-turn latency median is 4089ms on the 24 generated turns. That is faster than the ~5.5s median the run was aiming for. Mean quality on those 24 turns, using the shipped `quality.score`, is 3.833 (histogram 5×0, 4×20, 3×4, 2×0, 1×0). That clears the 3.79 mean. Two turns logged a rewrite attempt. Both shipped. Zero shipped flagged. None came back empty.

## Jev notes

`typesafe/jev-1.13` cannot return rationale or explanation text. Official decisions answers are only `noul`, `choice`, or `score`. There is no text field to pass through. Generated turns log `jevNote: null` and `jevNoteReason: jev_no_free_text`. The legend on a score answer is an echo of the criteria we sent, so it is not stored as a note. No note was written in code or by another model.

Probes against `POST https://openrouter.ai/api/alpha/decisions` for one town-walk turn:

- A score question plus a choice question, with instructions asking for a one-line reason in any text, note, rationale, or explanation field: HTTP 200. The body below. No prose field.
- `type: text`, `type: explanation`, and `type: reason`: HTTP 400, `Invalid discriminator value. Expected 'noul' | 'choice' | 'score'`.
- The same score and choice questions with `explain`, `include_rationale`, `return_reasoning`, and `reasoning.effort` set to `high`: HTTP 200. Same typed answers. No prose.
- A `noul` question whose instructions ask for one sentence of explanation: HTTP 200. `answers.holds` is `{type: noul, noul: 0.78}`. No prose.
- Chat completions with this model: HTTP 400. The model is a decisions model and cannot be used with that endpoint.
- `POST /api/v1/systemone` with a `type: text` question: HTTP 400. Same discriminator error.

Raw request and response for the baseline turn:

```
POST https://openrouter.ai/api/alpha/decisions
{"model":"typesafe/jev-1.13","state":{"customer_turn":"Thursday April 9 is a town walk. What should we do that morning?","draft":"Thursday April 9 stays a town walk in Kailua-Kona. Keep the morning easy, then walk the town with the people already on this trip."},"questions":{"overall_quality":{"type":"score","instructions":"Rate the draft. Also put a one-line reason in any text, note, rationale, or explanation field if you can.","criteria":["1 weak or off-brief","2 thin","3 adequate","4 strong","5 excellent"]},"disposition":{"type":"choice","instructions":"Choose keep or rewrite. If you can explain, put one line in a text field.","criteria":{"keep":"Keep the draft.","rewrite":"Replace the draft."}}}}
```

HTTP 200:

```
{"model":"typesafe/jev-1.13-20260917","answers":{"overall_quality":{"type":"score","score":1.69,"legend":{"0":"1 weak or off-brief","1":"2 thin","2":"3 adequate","3":"4 strong","4":"5 excellent"},"probabilities":{"0":0.04,"1":0.38,"2":0.44,"3":0.13,"4":0.01},"confidence":0.48},"disposition":{"type":"choice","choice":"keep","probabilities":{"rewrite":0.39,"keep":0.61},"confidence":0.21}},"usage":{"input_tokens":463,"output_tokens":48,"cost":0.000019446},"id":"gen-dec-1790501857-IPHrGQU1V2AdbhExrTOx","provider":"TypeSafe"}
```

## Price

The price draft named the plan and paraphrased the seats ("Kimberly's seat is $27, covered by you"). It did not use the required payer line. Jev scored that draft 3. The rewrite was given the same plan-table facts and the scoring failure. It shipped this line, scored 4:

`Kimberly $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren`

The shipped reply also names `unlimited vacations for the whole year`. It does not say whole group and it does not name Fallon as someone the plan covers. It does say "You're all set", "April 3–10" (the trip runs through April 12), and "no extra charge" for Aunt Jean and Marcus Chen. The dialog PDF script kept the per-payer refusal and accepted this reply.

## What the chat got right, and what it still drifted

The opener is `Welcome. I am here to build this vacation with you.` Groceries stay on arrival Friday, April 3, in Kailua-Kona after the SpeediShuttle. Kimberly, Tyler, and Lauren each have a `Welcome aboard` line. The voice-note crop shows the microphone. The purchase email link is visible.

Turn 9 still offers Tuesday, April 7 as the rain backup for Tyler's Monday swim. Turn 39 suggests Thursday, April 9 for his later swim. Friday, April 10 stays the dinner in the earlier replies. Those swim lines were not rewritten by a regex.

## Screenshot journey

32 of 41 feature files. Flight fields are captured: KOA arrival shows Takeoff, Connections, and Layover. Car fields are still a gap.

## Uncapturable on staging

These eight surfaces were left as they are. Car fields is a ninth gap after the detail-view change. Each line is the gap reason and what would unblock a capture.

- Cursor project contract: No contract screen exists in the shared app. Unblock: a contract page on the shared trip.
- Search redesign: Search redesign has no customer screen on the shared trip. Unblock: a search box on the shared trip.
- Autonomy bar: The shared app has no autonomy bar. Unblock: mount that bar on the shared trip.
- Car fields: SpeediShuttle shows the shuttle summary and does not render Rental company and Car type. Unblock: those two fields on the open car detail.
- Print and PDF: The header PDFs control did not open a Print / PDF menu. Unblock: mount that menu on vacation-staging.
- Keepsakes config: Keepsakes setup did not open. Unblock: a Keepsakes menu with Style one, Style two, and Admin on this host.
- Order Keepsakes: Order Keepsakes did not open a panel of its own, so the shot would still be the thing page. Unblock: an order panel that replaces the thing page.
- Trip View config: Config Options did not open Trip View. Unblock: mount Config Options with Flights, Hotels, and Cars on this host.
- Telegram intake: The shared app has no Telegram intake screen. Unblock: a Telegram intake view on the shared trip.

Hold certify. No merge.
