# Flight fields

On flight-class things (`bn(Dt)`):

- Takeoff
- Connections
- Layover

Search asks which airline the customer prefers before filtering. A named airline shows that airline's options. No preference shows at most one option per airline. No answer yet returns the question and no options. See `features/search-redesign.md`.

Flights tab list row (#959): at 480px and narrower, the fare (`data-ts-flight-price`) sits right of the name, vertically centered with it, like the other Thing cards. The departure and arrival time chips sit on the row below. The list summary is natural prose: stored clock times become time-of-day words, and the "<name> HH:MM–HH:MM covers A to B" and "The flight covers N miles" templates are rewritten (`src/vacation/flight-summary-prose.mjs`).
