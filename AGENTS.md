# Architecture rules

- Render HTML messages through `src/lib/messageFormatting.ts` and shared message-content styles; this preserves semantic formatting and prevents divergent unsafe renderers without changing stored content.
- Keep essential support navigation separate from retained operational routes; removing modules from the menu must not erase historical records.
- Email AI intake uses a caller-scoped transactional RPC and the caller's authenticated client; this preserves staff permissions, ticket defaults and retry safety without privileged credentials.