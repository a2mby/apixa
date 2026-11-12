# Diagnose before restructuring

**Why it exists:** Names structural smells so a diagnosis rests on imports and consumers, not folder impressions.
**Use when:** reviewing structure, tracing a cycle, or naming a refactoring smell.
**Do not use when:** the code has no structural symptom; do not invent a smell to justify a restructure.

Use a symptom to form a hypothesis; inspect imports and consumers before accepting the diagnosis.

| Symptom                                                 | Likely cause                                                  | Fix                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `utils.ts` growing with domain logic                    | Missing owner                                                 | Move into the owning module                                           |
| Component imports 3+ other features                     | Component coordinating unrelated systems                      | Lift coordination to capability/app composition                       |
| Same rule implemented in 2 places                       | No single authority                                           | Pick owner, expose function, delete the copy                          |
| Circular import                                         | Wrong dependency direction or shared concept lives in neither | Extract the shared concept to `_shared/` or invert via callback/props |
| Server data copied into global store                    | Duplicate state                                               | Use the query cache as owner; derive the rest                         |
| Prop drilling > 3 levels                                | Owner too high or too low                                     | Colocate state with consumers, or compose via children/slots          |
| Barrel files re-exporting everything                    | Leaky public API                                              | Export only the intentional interface                                 |
| Feature A deep-imports `featureB/internal/x`            | Boundary violation                                            | Import from B's `index.ts` or add the missing public export           |
| Context used for frequently changing values             | Rerender storms                                               | Local state, store with selectors, or colocate                        |
| Premature abstraction (`<GenericThing config={...} />`) | Similar-looking, different responsibilities                   | Duplicate until a second real shared reason appears                   |

## Confirm the cause

- **Growing utilities:** find actual callers and the rule's business owner. Domain logic remains private to that owner even if many callers exist.
- **Imports/prop depth:** an app composition component legitimately coordinates features, and stable props through three wrappers alone do not justify a store. Confirm repeated changes or mismatched ownership.
- **Cycles:** inspect resolved paths, type-only edges, and barrel re-exports. Type cycles still indicate coupling; a runtime initialization cycle is a separate execution risk. Extract only a neutral concept with actual multiple consumers, or pass an input from the coordinator.
- **Duplicate state:** distinguish a versioned editable draft from a mirrored server response. If server data is provided statically, keep the server owner instead of adding a query cache to satisfy the table.
- **Context:** profile the changing provider value and affected consumers before adding a store. Separate stable configuration from high-frequency interaction state.

## Choose the smallest repair

| Repair                  | Problem solved                 | Cost                                 | When not to use                         | Misuse failure                                          |
| ----------------------- | ------------------------------ | ------------------------------------ | --------------------------------------- | ------------------------------------------------------- |
| Localize logic          | Missing authority              | Import and call-site updates         | Existing shared responsibility is real  | Copying instead of moving duplicates rules              |
| Lift coordination       | Unrelated systems in a leaf    | Explicit props/callbacks             | Leaf already owns the workflow          | App becomes a business-logic bucket                     |
| Extract neutral concept | Peer modules share one concept | New private interface                | Concept belongs to one peer             | `_shared/` becomes a dumping ground                     |
| Narrow barrel           | Accidental dependency reach    | Consumer migration                   | Runtime entries need distinct contracts | Mixing client/server exports leaks runtime dependencies |
| Selector/local state    | Unrelated rerenders            | Subscription and lifecycle ownership | Low-frequency context is sufficient     | Multiple stores mirror the same datum                   |

Apply the [refactoring protocol](refactoring.md) after naming the confirmed smell. Preserve behavior while repairing it.
