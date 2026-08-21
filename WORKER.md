# Fudge Explorer Worker

This Worker serves the Fudge Explorer UI and forwards bounded, immutable CozoDB
reads to the existing same-account `FudgeInternal` service entrypoint. It does
not hold Mnestic credentials. The Explorer and its bounded read-only query
endpoint are public and require no authentication.

Build and deploy:

```sh
npm run deploy
```

Request:

```http
POST /v1/query
Content-Type: application/json

{
  "contractVersion": "mnestic-query-v1",
  "script": "?[id] := *capture{id} :limit 10",
  "parameters": {},
  "expectedGeneration": 70524,
  "limits": {
    "maxRows": 2000,
    "maxBytes": 2097152
  }
}
```

The response is the unchanged Mnestic query result. Callers must treat
`truncated: true` as incomplete and carry `observedGeneration` into
`expectedGeneration` for related follow-up reads.

`GET /v1/query` returns an Explorer bundle assembled from live queries. Its
catalogue projections are deliberately not fenced to one corpus generation, so
ingestion and backfills do not prevent the Explorer from loading. Each response
is still shape-checked and rejected when truncated or malformed. The browser
uses `phase=bootstrap` to materialize a deterministic
480-capture layout while mounting only the near camera window. Each mounted
capture occupies its final aspect-ratio slot before its 640px field texture
decodes; focused captures upgrade to 1600px. Search submissions append persistent
view planes at fixed z intervals, while in-view filter changes replace the
active plane. The camera moves through those planes and outward scrolling
returns to a cached parent. The view stack, active depth, and focused capture
are URL-hash state, so browser back and forward restore the same navigation.
The browser carries `observed_generation` into `phase=details` as catalogue
lineage rather than as a live-database fence;
screenshot-pixel palettes arrive in the bootstrap and measured typography
hydrates in place. Bootstrap and detail projections may reflect adjacent corpus
generations while writes are active.
Search and filters use the complete in-memory capture metadata; filtered fields
expose exact corpus totals and render up to 480 ranked matches.

The UI uses the bounded capture-similarity and evidence routes when a visitor
opens those focused-capture actions:

```http
GET /v1/similar-fonts?familyId=109&generation=70715&limit=8
GET /v1/similar-captures?captureId=9367&generation=70715&limit=12
GET /v1/capture-evidence?captureId=10445&generation=70715
GET /v1/term-values?termId=typography.role.body&generation=70715
GET /v1/relation-columns?relation=capture&generation=70715
GET /v1/media/10445
```

Similarity and detail routes accept the bundle's `observed_generation` to
identify the requesting catalogue. It is not used as a global database fence.
Font targets use exact catalogue IDs. Capture results use the target capture's
stored vector from the active screenshot index. These lookups are also
unfenced, so a follow-up read may observe a newer corpus revision. Distances
are returned without conversion to an invented similarity percentage.

Font similarity results preserve the ranked face's exact content digest, face
index, and variation coordinates. The UI sends that identity to Fudge's public
server-side PNG specimen renderer, so commercial font bodies stay private. A
candidate remains visible with an explicit reason when its specimen cannot be
rendered.

Capture images and motion clips are proxied through `/v1/media/:captureId` and
`/v1/media/:captureId.webm` so WebGL can consume them from the Explorer's
origin. Measured effects, exact term support values, and schema columns remain
available from bounded live endpoints.

The deployed Explorer is:

```text
https://fudge-explorer-query-proxy.simdi.workers.dev/
```

For local development, run `npm run dev`.
