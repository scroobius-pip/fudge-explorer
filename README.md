# Fudge Explorer

A public explorer for the Fudge design corpus, served by a Cloudflare Worker.

- Live site: https://explorer.withfudge.com
- Design with Fudge: https://design.withfudge.com
- Design references: https://github.com/scroobius-pip/fudge-design-md

The explorer renders live, generation-fenced reads from the Fudge corpus:
captures, fonts, colors, text styles, and measured effects — with on-demand
font similarity, capture similarity, evidence, and schema views. See
[WORKER.md](./WORKER.md) for the API and deployment details.

```sh
npm run dev      # build assets and run locally
npm test         # run the test suite
npm run deploy   # deploy to Cloudflare
```
