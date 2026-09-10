# vacation-3 non-Telegram media plan

Share token: `las-vegas-vacation-3`
TREK trip: `197`
Bind API: `POST /api/bind-thing-media`
CLI: `node scripts/bind-thing-media.mjs --share-token las-vegas-vacation-3 --file <path> --write-public`

Expected SCT dir: `/workspace/sct-runs/story-draft-20260907/media/`
This VM does not currently have those files. Filename hints below are how the CLI maps them.

## Bind (on this trip)

| Filename hint | Thing | thingId | Day |
|---|---|---|---|
| `*conservatory*` `*cocktail*` | Bellagio Conservatory — Anniversary Cocktails | 8871 | 1 |
| `*carbone*` | Carbone at Aria | 8872 | 1 |
| `*shake*` | Shake Shack near Cosmo/Aria | 8873 | 2 |
| `*lotus*` | Lotus of Siam | 8874 | 3 |
| `*eggslut*` | Eggslut | 8875 | 3 |
| `*cosmo*` `*shop*` | Cosmopolitan shops | 8876 | 2 |
| `*sfo*las*` `*outbound*` `*depart*` | SFO to LAS Thu Oct 9 | 8877 | 1 |
| `*las*sfo*` `*return*` `*inbound*` | LAS to SFO Sun Oct 12 | 8878 | 3 |
| `*bellagio*` `*lodging*` `*hotel*` `*fountain*` | Bellagio — Alex & Kim Anniversary Stay | 8869 | 1 |

## Skip until Things exist (note only)

| Filename hint | Name |
|---|---|
| `*high-roller*` `*high_roller*` | High Roller |
| `*sphere*` | Sphere |
| `*cirque*` | Cirque O |

## Batch command (when the SCT dir is present)

```
node scripts/bind-thing-media.mjs \
  --share-token las-vegas-vacation-3 \
  --dir /workspace/sct-runs/story-draft-20260907/media \
  --write-public
```

Then Cursor-deploy vacation-staging (already aliased to https://vacation-staging.timesyncher.com).

Native TREK Journey Book on travel.timesyncher.com still needs TREK host:

```
node scripts/bind-thing-media.mjs --share-token las-vegas-vacation-3 --dir /workspace/sct-runs/story-draft-20260907/media --apply-trek
```

## Proof already bound

- Carbone 8872 → `/ts-thing-media/las-vegas-vacation-3/carbone-bind-proof.png`
- Journey Book: https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/journey
