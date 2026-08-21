# Fudge Explorer

A public explorer for the Fudge design corpus, served by a Cloudflare Worker.

- Live site: https://explorer.withfudge.com
- Design with Fudge: https://design.withfudge.com
- Design references: https://github.com/scroobius-pip/fudge-design-md

The spatial explorer loads live corpus projections without imposing one
generation fence across the whole catalogue, materializes a
deterministic 480-capture masonry layout, and opens on a near camera window.
Only the overscanned window mounts; every mounted capture starts with its final
aspect-ratio geometry and replaces its skeleton in place as the texture decodes.
Search submissions materialize persistent views deeper on the z-axis; the camera
moves through each prior view, and outward scrolling returns to it. Filter
changes outside search replace the active view instead of growing the stack.
The view stack, active depth, and focused capture live in the URL hash for native
back and forward navigation. Hover-anchored zooming upgrades a focused capture
from the 640px field texture to a 1600px texture. Screenshot-pixel palettes
arrive with the first field; measured typography hydrates in place. Search uses
the loaded catalogue, supports keyboard selection, and reports its corpus
totals. Focused capture effects and screenshot-embedding neighbors load through
bounded live routes. The catalogue may contain observations from adjacent
corpus generations while ingestion is active. See
[WORKER.md](./WORKER.md) for the API and deployment details.

```sh
npm run dev      # build assets and run locally
npm test         # run the test suite
npm run deploy   # deploy to Cloudflare
```
