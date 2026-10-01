// expect saveTrip
async function saveTrip() { return 1; }
saveTrip();
---
// expect none
async function saveTrip() { return 1; }
await saveTrip();
---
// expect none
async function saveTrip() { return 1; }
void saveTrip();
---
// expect none
async function saveTrip() { return 1; }
return saveTrip();
---
// expect saveTrip
async function saveTrip() { return 1; }
const kept = saveTrip();
void kept;
---
// expect .then
saveTrip().then(() => 1);
---
// expect none
saveTrip().then(() => 1).catch(() => 0);
---
// expect none
saveTrip().then((value) => value, () => 0);
---
// expect fetch
fetch('/api/trips');
---
// expect none
await fetch('/api/trips');
---
// expect none
function local() { return 1; }
local();
