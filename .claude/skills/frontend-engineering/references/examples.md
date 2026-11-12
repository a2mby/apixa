# Worked placement decisions

**Why it exists:** Shows worked placement decisions so classification is calibrated against concrete cases.
**Use when:** classifying a new capability or deciding whether a split earns its cost.
**Do not use when:** the placement is obvious from the Ownership Ladder; do not copy an example's structure by analogy.

## Example 1: stays flat (Simple)

"Add newsletter signup form to footer."

```text
components/footer/
  Footer.tsx
  NewsletterForm.tsx      # owns form state + submit
  newsletter.api.ts       # one POST call
```

Why flat: one workflow, one owner, no second consumer. No `features/newsletter/`, no store, no service layer.

Tradeoff: solves one footer interaction; costs one local form and typed call; stop using this placement when signup becomes an independently reused capability; promoting it early creates needless coupling. The POST uses an existing contract, not an invented endpoint. In this repo, inspect `apps/web/src/shared/components/Footer/` and its callers for the actual placement/naming. Colocation beside existing shared chrome does not make signup rules globally reusable.

## Example 2: decomposed (Complex)

"Chat module: conversations list, message thread, composer, realtime connection, unread counts."

```text
features/chat/
  index.ts                       # public API only
  conversations/                 # list + selection state
  thread/                        # message rendering, pagination
  composer/                      # draft state, attachments, send
  realtime/                      # socket lifecycle, event -> store mapping (no UI)
  unread/                        # derived counts, badge
  _shared/                       # types, message model used by 3+ modules
```

Rules: `realtime` has zero UI imports. `unread` derives from message data, never stores a copy. `composer` never reads `thread` internals; it calls `thread`'s public API or emits through the capability's coordinator.

Why this split: realtime, composing, and rendering change independently and have different owners of state.

Before creating files, fill the Module Map: conversations owns selection, thread owns the message read/cache lifecycle, composer owns drafts, realtime owns the connection, and unread owns only derivation. Server messages remain authoritative; the coordinator routes acknowledgements/events into one cache. This meets multiple Complex triggers: 4+ workflows, shared data, and independently evolving sub-areas.

Tradeoff: solves independent evolution of connection/composition/rendering; costs narrow APIs and explicit coordination; avoid this split for a static transcript; misuse produces cyclic sibling imports or two message stores.

**Counter-example (reject):** `components/ hooks/ utils/ types/ services/` at feature root with 40 files. That is grouping by file type, not by responsibility.

## Example 3: server list with local controls (Moderate)

"Add a careers directory with API pagination and a local filter panel."

```text
features/careers/
  index.ts
  components/
    CareersDirectory.tsx
    CareersFilters.tsx
  careers.api.ts
```

Evidence: one read workflow plus server data and local filter UI. URL parameters own committed filters/page; the filter panel owns only its unsaved edits. The typed client sends pagination/filter parameters; route/server rendering owns the read by default. If the established app uses a client query cache, that cache owns the read instead. There is no extra hook until browser-driven fetching requires one.

Tradeoff: solves list/control cohesion; costs a deliberate route-to-feature interface; avoid a new folder if an existing careers owner already fits; copying the response into a store creates stale pagination. In A Square, extend the existing careers API surface rather than adding the illustrative client beside it.

## Example 4: break a cycle without inventing a new layer

"The editor imports the document model; the model imports the editor's selection helper."

Trace the resolved edges first. Keep document operations in the model and move selection orchestration to the editor. Pass a selected node ID into a pure model operation; model no longer imports editor. If the helper is a neutral concept actually consumed by two peer modules, place it in capability `_shared/` instead. Do not move UI knowledge there merely to hide the cycle.

Tradeoff: restores model independence; costs one explicit parameter and import updates; avoid callback inversion for an already pure shared concept; broad extraction can recreate the cycle through a barrel. Verify the prior cycle disappears and forbidden reverse imports fail. A Square already restricts `cms/model -> cms/editor`; strengthen the existing rule instead of replacing unrelated lint configuration.

## Example 5: split a real subsystem by responsibility

"Extend CMS editing with undo, publish status, and preview session expiry."

Inspect `features/cms/index.ts`, `model/index.ts`, the transaction reducer under `editor/transactions/`, and the session/server consumers before deciding placement. Model schema, local transaction history, preview session lifecycle, and publish transport change independently; existing CMS work is Complex. Extend those owners rather than creating a parallel `cms/services` bucket.

Use a Module Map for the affected modules. Document history owns local edits; server draft/published data belongs to the API; publish status derives from acknowledgements and the transaction watermark. Preserve `model -> editor` prohibition and design-token independence. Treat CMS-specific code currently under `shared/` as an existing placement issue, not a precedent for new promotion.

Tradeoff: makes the next CMS change locatable; costs keeping the existing module interfaces coherent; avoid subsystem restructuring for a single label change; treating local undo as authoritative persisted history corrupts publish behavior.
