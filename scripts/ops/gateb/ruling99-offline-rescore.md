# Offline re-score of immutable rev3 artifacts

No capture, app round, or counted Gate B attempt. Old observer exactly reproduces saved rev3 result. Capture bytes are unchanged. Overall FAIL 24/32 under both observers.

| Class | Old failures | New failures |
|---|---:|---:|
| tabs | 24 | 24 |
| row ink | 6 | 6 |
| generic logos | 15 | 15 |
| whole item frame | 8 | 0 |
| name frame | 0 | 8 |
| missing name | 0 | 8 |

Each cell below is old → new (P/F), per screen. All unrelated reason strings match byte for byte.

| Screen | Tabs | Row ink | Generic | Whole item | Name frame | Missing name |
|---|---|---|---|---|---|---|
| budget-1280-top.png | P → P | P → P | P → P | P → P | P → P | P → P |
| budget-1280.png | P → P | P → P | P → P | P → P | P → P | P → P |
| budget-390-top.png | P → P | P → P | P → P | P → P | P → P | P → P |
| budget-390.png | P → P | P → P | P → P | P → P | P → P | P → P |
| cars-1280-top.png | F → F | P → P | P → P | P → P | P → P | P → P |
| cars-1280.png | F → F | P → P | P → P | P → P | P → P | P → P |
| cars-390-top.png | F → F | P → P | P → P | P → P | P → P | P → P |
| cars-390.png | F → F | P → P | P → P | P → P | P → P | P → P |
| daybyday-1280-top.png | P → P | P → P | P → P | P → P | P → P | P → P |
| daybyday-1280.png | P → P | P → P | P → P | P → P | P → P | P → P |
| daybyday-390-top.png | P → P | P → P | P → P | P → P | P → P | P → P |
| daybyday-390.png | P → P | P → P | P → P | P → P | P → P | P → P |
| events-1280-top.png | F → F | F → F | F → F | P → P | P → F | P → F |
| events-1280.png | F → F | F → F | F → F | P → P | P → F | P → F |
| events-390-top.png | F → F | P → P | P → P | F → P | P → F | P → F |
| events-390.png | F → F | P → P | F → F | F → P | P → F | P → F |
| flights-1280-top.png | F → F | P → P | F → F | P → P | P → P | P → P |
| flights-1280.png | F → F | P → P | F → F | P → P | P → P | P → P |
| flights-390-top.png | F → F | P → P | F → F | F → P | P → P | P → P |
| flights-390.png | F → F | P → P | F → F | F → P | P → P | P → P |
| hotels-1280-top.png | F → F | P → P | F → F | P → P | P → P | P → P |
| hotels-1280.png | F → F | P → P | F → F | P → P | P → P | P → P |
| hotels-390-top.png | F → F | P → P | F → F | F → P | P → P | P → P |
| hotels-390.png | F → F | P → P | F → F | F → P | P → P | P → P |
| restaurants-1280-top.png | F → F | F → F | F → F | P → P | P → F | P → F |
| restaurants-1280.png | F → F | F → F | F → F | P → P | P → F | P → F |
| restaurants-390-top.png | F → F | F → F | F → F | F → P | P → F | P → F |
| restaurants-390.png | F → F | F → F | F → F | F → P | P → F | P → F |
| stores-1280-top.png | F → F | P → P | P → P | P → P | P → P | P → P |
| stores-1280.png | F → F | P → P | P → P | P → P | P → P | P → P |
| stores-390-top.png | F → F | P → P | P → P | P → P | P → P | P → P |
| stores-390.png | F → F | P → P | P → P | P → P | P → P | P → P |

Legacy rev3 first_text has no Range rects. Its recorded leaf box is retained as explicitly labelled legacy geometry; no first-line proof is claimed for a wrapped legacy leaf. New captures must apply capture-name-line.patch, which records Range rects, before using this pin. Missing legacy names now fail closed. No artifacts were invented or rewritten.
