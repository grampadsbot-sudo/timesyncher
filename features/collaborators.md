# Collaborator and edit flows

Detail access copy (live):

- “Checking edit access…”
- “Saved to itinerary”
- “Saving…”
- “Could not save — check your connection and try again”

Thing detail modal for view-only viewers shows no edit-status line after access check (trip header already omits view-only copy).

Web editor: named email invite (owner-approved). Telegram collaborator edit: paid entitlement. Possession of the shared URL is view-only. Owner/web-editor cookie (`ts_vacation_web_access`) enables edit on `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/` after the one-time launch/accept link.

Flag tab **Chat** when `share_collab`.

Owner session link (#959): the vacation app GET (`vacation-app.html?session=…`) gives a non-seat owner session a `ts_vacation_web_access` owner grant for the selected trip (`src/vacation/vacation-app-owner-web-access.mjs`). The site-pane iframe's `edit-access` call then returns `canEdit: true`, so the owner sees the detail pencil. Viewers and collaborator seats get no cookie from this path.
