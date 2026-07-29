# Tests & Coverage

This package uses Vitest for unit tests, running under Vite. 

## Commands

- **Run all workspace tests**: `pnpm -r test`
- **Run only app tests** (from this package dir): `pnpm test`
- **Open Vitest UI**: `pnpm test --ui`
- **Coverage report**: `pnpm test --coverage`

## Test layout

- Test files live alongside source in `src/**` and end with `.test.ts` or `.test.tsx`.
- Path alias `@/` resolves to `src/` (Vite + TS config).

## Environment

- Default environment: jsdom (configured in `vite.config.ts`).

## Coverage

- Uses `@vitest/coverage-v8`.
- Run (from this package dir): `pnpm coverage`
- Outputs coverage summary to the console and a report in `coverage/`.
