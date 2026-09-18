# vacation-3 non-Telegram media plan

Share token: `las-vegas-vacation-3`
TREK trip: `197`
Bind API: `POST /api/bind-thing-media`
Exact map: `SCT_VACATION3_MEDIA_PACK` in `src/vacation/thing-media-bind.mjs`
CLI: `node scripts/bind-thing-media.mjs --map-only`

Expected SCT dir: `/workspace/sct-runs/story-draft-20260907/media/`

## Exact SCT pack

| File | Action | Thing | thingId |
|---|---|---|---|
| `boarding-passes-photo.jpg` | bind | SFO to LAS Thu Oct 9 | 8877 |
| `boarding-passes-photo.jpg` | bind | LAS to SFO Sun Oct 12 | 8878 |
| `carbone-late-hands-photo.jpg` | bind | Carbone at Aria | 8872 |
| `carbone-plates-photo.jpg` | bind | Carbone at Aria | 8872 |
| `conservatory-photo.jpg` | bind | Bellagio Conservatory — Anniversary Cocktails | 8871 |
| `eggslut-sandwich-photo.jpg` | bind | Eggslut | 8875 |
| `shake-shack-fries-photo.jpg` | bind | Shake Shack near Cosmo/Aria | 8873 |
| `bellagio-fountain-late-video.mp4` | bind | Bellagio — Alex & Kim Anniversary Stay | 8869 |
| `bellagio-fountain-night-video.mp4` | bind | Bellagio — Alex & Kim Anniversary Stay | 8869 |
| `cirque-program-photo.jpg` | skip | Cirque O | — |
| `high-roller-photo-01.jpg` | skip | High Roller | — |
| `high-roller-photo-02.jpg` | skip | High Roller | — |
| `high-roller-photo-03.jpg` | skip | High Roller | — |
| `sphere-late-photo-01.jpg` | skip | Sphere | — |
| `sphere-late-photo-02.jpg` | skip | Sphere | — |
| `sphere-led-video.mp4` | skip | Sphere | — |

Lotus of Siam (8874) and Cosmopolitan shops (8876) have no file in this pack.

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
