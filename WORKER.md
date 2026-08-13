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

`GET /v1/query` returns a complete, generation-fenced Explorer bundle assembled
from live queries. The deployed Explorer is:

Similarity is loaded only when a user opens the corresponding drill-down:

```http
GET /v1/similar-fonts?familyId=109&generation=70715&limit=8
GET /v1/similar-captures?captureId=9367&generation=70715&limit=12
GET /v1/capture-evidence?captureId=10445&generation=70715
GET /v1/term-values?termId=typography.role.body&generation=70715
GET /v1/relation-columns?relation=capture&generation=70715
```

Both routes require the bundle's `observed_generation`. Font targets use exact
catalogue IDs. Capture results use the target capture's stored vector from the
active screenshot index. Distances are returned without conversion to an
invented similarity percentage.

Font similarity results preserve the ranked face's exact content digest, face
index, and variation coordinates. The UI sends that identity to Fudge's public
server-side PNG specimen renderer, so commercial font bodies stay private. A
candidate remains visible with an explicit reason when its specimen cannot be
rendered.

Measured effects, exact term support values, and schema columns are also loaded
on demand. This keeps the startup bundle bounded while exposing borders,
shadows, radii, spacing, media, gradient stops, completeness, and live relation
columns at the same corpus generation.

The deployed Explorer is:

```text
https://fudge-explorer-query-proxy.simdi.workers.dev/
```

For local development, run `npm run dev`.
