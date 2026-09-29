# Toolcraft App Agent Worklog

## Status

Mode: starter

This is a neutral template. Before first product delivery, replace this status with `Mode: product` and record concrete decisions. Keep later entries compact. Detailed requests and results belong in `docs/agent-journal/changes`; text command attempts live in `.toolcraft/journal/runs`.

## Decision Trail

Product delivery has not started. Add one entry per coherent request. Give entries a stable `Change ID` and select the current one with `Active change: <id>` outside this section. Keep every entry inside this section; display order is not execution authority.

A first delivery records request, references, applied contracts, decisions, alternatives, state/output mapping, checks and risks. A later `Entry type: focused` records `Change ID`, `Request`, `Changed owner`, `User-visible result`, `Verification` and `Risks`. `Verification` describes the actual checks and their results; command mentions never authorize execution.

For a localized, user-authorized performance iteration, record only this separate domain authority in the selected entry:

```md
- Performance intent: performance-iteration
- Performance request evidence: "<verbatim exact Request quote>"
- Performance paths: ["performance-path:%5B...%5D"]
```

Missing performance intent means ordinary work. Performance evidence must be an exact nontrivial raw Request substring; paths must be unique canonical IDs. Unresolved localization creates no path authority. Run `npm run verify:delivery` for initial functional delivery or one authorized targeted iteration; full performance certification requires a separate explicit request.

## Decisions

### Change `place-replaces-occupied`

- Entry type: focused
- Change ID: place-replaces-occupied
- Request: «При повторном клике на клетку выбранная сушина заменяется… Если нажимаешь на поле на sushi_1 и выбрана sushi_2 то заместо sushi_1 встанет sushi_2.»
- Changed owner: `src/app/iso/iso-replace.ts` (new), `src/app/iso/iso-field.ts`, `src/app/iso/iso-scene.tsx`.
- User-visible result: Place over a busy cell replaces what stands there; the same piece put back gets a fresh id and replays its landing; the piece it displaced does not play an exit. Erase is unchanged.
- Verification: 131 iso Vitest tests pass; `ai:check` passes (56 files); typecheck clean for `src/app`. In the running app, a click over another object swapped `media-2@0,0` → `media-1@0,0` with the piece count unchanged and no leaving node across 20 polled frames; re-placing the same object produced `media-1@3,2~1` then `~2`, each newcomer carrying a running 440ms landing transition at currentTime 0; an erase still held a leaving node for ~128ms.
- Risks: Ids of re-placed pieces carry a `~N` suffix and are persisted; an undo step is recorded even when a re-place looks identical on screen.


### Renderer

- Decision: No product renderer yet.
- Reason: The starter is intentionally neutral.
- Evidence: Replace with concrete product schema, implementation and focused evidence before first delivery.

### View Interaction

- Decision: No spatial product view yet.
- Reason: The starter is intentionally neutral.
- Evidence: Replace with concrete product schema, implementation and focused evidence before first delivery.

### Interaction Ownership

- Decision: No product interaction ownership yet.
- Reason: The starter is intentionally neutral.
- Evidence: Replace with concrete product schema, implementation and focused evidence before first delivery.

### Timeline

- Decision: No product animation yet.
- Reason: The starter is intentionally neutral.
- Evidence: Replace with concrete product schema, implementation and focused evidence before first delivery.

### Layers

- Decision: No product layer workflow yet.
- Reason: The starter is intentionally neutral.
- Evidence: Replace with concrete product schema, implementation and focused evidence before first delivery.

### Controls

- Decision: No product control sections yet.
- Reason: The starter is intentionally neutral.
- Evidence: Replace with concrete product schema, implementation and focused evidence before first delivery.

### Export

- Decision: No product output yet.
- Reason: The starter is intentionally neutral.
- Evidence: Replace with concrete product schema, implementation and focused evidence before first delivery.

### Performance

- Decision: No product workload yet.
- Reason: The starter is intentionally neutral.
- Evidence: Replace with concrete product schema, implementation and focused evidence before first delivery.

Canonical control values and selected-entity isolation must follow runtime representations and the declared selection owner. Render-scale-enabled products record functional `renderScaleCoverage`; prose never substitutes for asserted backing-quality proof.

## Evidence

- Source reviewed: neutral starter schema and local Toolcraft docs.
- Contract applied: product decisions belong to the generated app; platform development history is not copied into this template.

## Verification

Protected receipts own initial/performance proof. Later edits record focused checks and text journal run IDs. Failed attempts and their retries remain separate; no screenshots, videos or binary traces are required by the journal.

## Risks

- Risk: Replace neutral decisions before first product delivery. Historical source revisions or message references that are unknown must remain explicitly unknown.
