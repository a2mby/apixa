# Forms, interaction, and styling

**Why it exists:** Keeps form, interaction, and styling work inside the owning feature with one source of validation truth.
**Use when:** implementing interaction, forms, or visual changes inside an in-scope feature.
**Do not use when:** the task is a pure styling tweak or single-component bug; make it directly.

Use within an in-scope feature task. Pure styling or a single-component bug does not independently trigger the architecture skill.

## Form procedure

1. Find the form owner and comparable active flow. Keep draft state, submit lifecycle, and UX schema beside that owner. Use the existing form/validation library; exception: a native single-field form needs no library if it meets the same behavior/accessibility requirements.
2. Read the API contract and [validation ownership rules](api-first.md). Mirror constraints for immediate feedback, use server-provided limits when available, and surface server field/global errors. Client checks never authorize the operation.
3. Specify idle, pending, success, failure, and empty/unavailable behavior. Disable accidental resubmission while pending; for retry/unknown outcomes follow the network policy in [system design](system-design.md).
4. Keep entered data after recoverable failures. Reset only on confirmed success or an explicit user reset. Separate unvalidated draft values from parsed submission values when the schema transforms/coerces inputs.
5. Use labels, semantic controls, keyboard operation, visible focus, and announced status/errors. Focus the first invalid field or error summary on failed submission; restore focus after a dismissed modal.
6. Keep interaction effects with the owner and clean up subscriptions, timers, and abortable requests on disposal. Preserve existing navigation and success behavior unless the task changes it.

In A Square, inspect the active CareersApply, ServiceRequestDetails, or MeetingBooking form and its colocated schema before choosing a pattern. Reuse the existing React Hook Form/Zod integration and established API failure mapping. A disabled booking slot in the UI does not replace server availability validation.

## UI composition

Reuse the current primitives before introducing a configurable generic component. Extract a child around an independently understandable interaction or a real shared responsibility. Pass presentation through children/slots when it removes coordination from a leaf. Keep domain-specific labels, actions, and rules in the feature; domain-neutral primitives receive those through their interface.

## Styling procedure

- Inspect the owner component and established tokens/primitives; reuse those tokens before adding raw color/spacing values. Add a token only for a real reusable design concept; retain a local value for a one-off owner-specific effect.
- Follow the existing styling mechanism. Introduce a new technology only when the current one is the demonstrated cause of a requirement failure, using the decision procedure.
- Verify responsive sizes, long text, keyboard/focus, contrast, empty/error states, and the project's locale/RTL requirements. Preserve semantic content order when the visual layout changes.
- Respect reduced motion for animations; default to a static equivalent under the user's preference. Keep animation state/timers in the interaction owner.
- Keep styles with their component/module; promote only through the Ownership Ladder. Reuse a shared primitive rather than copying its styling into several features.

Tradeoff: colocation keeps interaction and its visual states coherent; costs some intentional local repetition. Avoid merging unrelated forms into a config-driven system just because their fields look alike. Misuse turns shared primitives into domain rule owners or hides important error states behind generic configuration.
