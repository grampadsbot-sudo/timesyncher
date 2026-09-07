# vacation-3 TG evidence pack (SCT / CoS)

Product UI and StagingBot shots attached this turn. TREK 197 still has no restaurant / store / flight Things. Spouse holding resends.

## Shots

| File | What SCT showed |
| --- | --- |
| `shared-restaurants.png` | https://travel.timesyncher.com/shared/las-vegas-vacation-3/ Restaurants tab active. Copy: **No restaurants match those tags.** Header still names Carbone in the unforgettable-goal blurb only. |
| `tg-carbone.png` | StagingBot. Stale 11:32 bubble cites **vacation-2** after a vacation-3 no-match (pre-rebind chat). 11:35 inbound: `Add restaurant Carbone at Aria Thu Oct 9 9:15pm anniversary to …/las-vegas-vacation-3/`. Draft in composer: Shake Shack add. |
| `tg-replies-latest.png` | 11:44 inbound SFO→LAS add on vacation-3. Bot (K G): exact no-match copy. |

Carbone bot reply (not fully in the Carbone frame; in Neon + `bot-replies-verbatim.txt`):

`I heard "Add restaurant Carbone at Aria … vacation-3/", but I did not change the itinerary from this message.`

## Verbatim

`bot-replies-verbatim.txt` — all post-rebind adds on trip `26399e64`. Carbone = `apply_not_on_turn`. Everything else = `no_match`. No worker queued.

## Live vs shots

- TREK 197 API still: places 8869 Bellagio override, 8870 car queue, 8871 Conservatory. No Carbone.
- vacation-staging turn (`b33a78d` / `dpl_82FXeJxg3iW8FxPesXgLQSH6ZytF`) can queue add apply. Ubuntu worker has not pulled. Do not resend yet (old worker would land Carbone as Attraction).
- Exact Craig click: GBrain `cursor-tg-notes-land-vacation-3-20260907t190220z` (Ubuntu git pull) or python insert in `…t185821z`.
