# v3.0.0 — Context

Frozen milestone context. Living direction: [`docs/context.md`](../../docs/context.md).

## Goal

Deliver the owner-approved Core architecture overhaul in one coordinated breaking release. The
32 decisions in the implementation brief and [`define-api-audit.md`](../../docs/audits/define-api-audit.md)
define the intended behavior; the audit's recommendations are superseded where the brief differs.

## Success

Applications define backend conventions once and receive predictable, strongly typed operations.
Requests, mocks, parsed source bodies, transformed data and validated results remain consistent and
observable. Regression tests protect the confirmed bugs, migration guidance describes actual v3
syntax, and the complete verification matrix passes before a release candidate is declared ready.

## Principles

- Core remains framework-independent and returns native promises; custom endpoints win.
- Backend conventions, envelopes and unusual behavior are configured explicitly, not guessed.
- Protect request and response integrity; invalid structure must not silently become empty data.
- Preserve existing file, streaming, mock, React and runtime capabilities.
- Keep one coherent operation, middleware, serialization, response and pagination model.
- Keep main stable; do not publish to npm as part of this milestone.

## Relationship to v1.9.0

The in-progress v1.9.0 pagination changes are existing work, not a completed release. Carry useful
behavior forward where consistent with v3; do not silently assert its unchecked criteria passed.
