## Capability: <name>

Purpose: <one sentence, what problem it solves>

| Module | Owns (state/rules) | Exposes (public API) | Depends on | Private details |
| ------ | ------------------ | -------------------- | ---------- | --------------- |
| ...    | ...                | ...                  | ...        | ...             |

Dependency rules:

- <module> -> <module> allowed; reverse forbidden
- Nothing outside the capability imports below its `index.ts`

Cross-capability contracts: <what crosses, via which mechanism>
Tradeoff: <problem solved; cost; when not to use; what breaks under misuse>
