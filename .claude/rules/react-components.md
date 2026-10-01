---
description: Reusable component rules for the web app
paths:
  - "apps/web/src/components/**"
  - "apps/web/src/app/**/*.tsx"
  - "apps/web/src/features/**"
---

# Component rules

- Reuse before creating. Look in `components/ui` (primitives), `components/shared` (cross-feature) and `docs/engineering/component-catalog.md` first.
- Layers: `components/ui` (design-system primitives: Button, Badge, Card, Dialog, Tabs, Table), `components/shared` (used by two or more features: PageShell, LockedCard, CompanyTag, Watermarked, EmptyState, ErrorBoundary), `features/<name>/components` (used by one feature).
- A component is presentational unless it must fetch. Data loading happens in server components or hooks, not inside primitives.
- Props are a small typed interface. Prefer `children` and slots over many boolean flags. Forward `className` and standard element props on primitives.
- Variants use one mechanism (for example `cva`) and the tokens from `docs/design/formal-tokens-light.css`. No inline hex colours or one-off spacing.
- Extract repeated markup on its second appearance. Extract repeated stateful logic into a hook in `src/hooks` or `features/<name>/hooks`.
- Keep files focused: one exported component per file, named like the file. Co-locate its test and any small helper.
- Accessibility is part of the component: semantic elements, labels, focus states, keyboard support.
- Never render paid content inside a shared component that may be statically generated. Paid content components are server-rendered and always go through `Watermarked`.
- Do not import from another feature's internals. Promote to `components/shared` instead.
