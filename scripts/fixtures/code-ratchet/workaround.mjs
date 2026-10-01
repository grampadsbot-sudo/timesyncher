// expect none
const label = 'TODO FIXME HACK temporary workaround for now quick fix';
---
// expect TODO
// TODO ship the real client
---
// expect FIXME
/* FIXME later */
---
// expect HACK
// HACK the clock
---
// expect XXX
// XXX remove
---
// expect temporary
// temporary bridge
---
// expect temp fix
// temp fix for the parser
---
// expect workaround
// workaround until the client lands
---
// expect for now
// leave this for now
---
// expect quick fix
// quick fix
