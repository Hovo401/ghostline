# apps/frontend

React 19 + Vite + TanStack Router (file-based) + TanStack Query + Zustand + Tailwind v4.

## Layering (enforced by eslint-plugin-boundaries, `pnpm lint` will fail on a violation)

```
app → routes → features → entities → shared
                              ↓
                           themes (shared may use themes; nothing else imports themes directly)
```

An element can only import from itself and the layers below it in this list. `shared` is the
floor — it imports nothing above it, ever. If a `feature` needs another `feature`'s code, that
code belongs in `entities` or `shared` instead of a sideways import.

| Layer       | Holds                                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`      | Bootstrap only — `main.tsx`. Nothing else lives here.                                                                                                                                                    |
| `routes/`   | TanStack Router file-based routes. Thin: wire up features, don't implement them here.                                                                                                                    |
| `features/` | One user-facing capability each (`pnpm gen frontend-feature <name>`).                                                                                                                                    |
| `entities/` | Domain objects (chat, message, user) — types + query hooks, shared by features.                                                                                                                          |
| `shared/`   | `ui/` (design-system primitives), `theme/` (the appearance engine), `api/` (HTTP/WS clients), `test/`.                                                                                                   |
| `themes/`   | One CSS file per theme's raw tokens. Nothing outside `shared/theme` and `themes/` itself should reference a `--gl-*` variable directly — components use the Tailwind utilities `theme.css` maps them to. |

## Design tokens — see DESIGN-BRIEF.md §2/§8 for the full contract

- Use Tailwind utilities backed by tokens (`bg-bg`, `bg-bg2`, `text-fg`, `text-mute`, `bg-accent`,
  `text-accent-text`, `text-ink`, `border-line`) — never a hex literal in a component
  (`no-restricted-syntax` blocks it in `.tsx`/`.ts`, `themes/*.css` is the one exception).
- Adding a theme: `pnpm gen theme <id>` → fill in `themes/<id>.css` → it's auto-imported into
  `shared/theme/theme.css` → add the id to `ThemeId`/`THEME_IDS` in
  `shared/theme/appearance-store.ts` → add a swatch on `/dev/ui`. No component changes, ever —
  if you find yourself editing a component to support a new theme, the token contract is
  missing something; fix the contract, not the component.
- `index.html`'s inline script and `shared/theme/use-apply-appearance.ts` implement the _same_
  resolution logic (`system` → `dark`/`light`) on purpose — one runs before React for the
  first paint, one takes over after. Keep them in sync if that logic changes.

## Data

- Server state (anything from the API) → TanStack Query, keyed and fetched from `entities/*`'s
  `use-*.ts` hooks. Don't `useState` + `useEffect` a fetch.
- Client-only state (drafts, upload queue, appearance, panel widths) → Zustand, colocated with
  the feature/shared module it belongs to (see `shared/theme/appearance-store.ts` for the shape).
- Realtime → one socket from `shared/api/socket-client.ts`; a feature subscribes to the specific
  `ServerToClientEvents` key it needs (from `@ghostline/contracts`) and updates the Query cache
  via `setQueryData`, it doesn't keep a second copy of that data in its own state.

## Testing

Vitest + Testing Library (`*.spec.tsx` next to the component — see `shared/ui/button.spec.tsx`).
`shared/test/setup.ts` wires up `@testing-library/jest-dom` matchers globally.
