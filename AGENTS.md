# Architecture rules

- Render HTML messages through `src/lib/messageFormatting.ts` and shared message-content styles; this preserves semantic formatting and prevents divergent unsafe renderers without changing stored content.