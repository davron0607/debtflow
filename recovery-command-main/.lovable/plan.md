# Debt Recovery OS — V1 MVP Build Plan

Building a clickable, seeded prototype of the "Единая операционная система взыскания" per the PRD. Russian UI, USD + UZS amounts, role-aware, in-memory store (React context), audit-everything.

## Architecture

- **Data layer:** single in-memory store in React context (`StoreProvider`) seeded on mount with Tenge Bank tenant, 2 collection agencies, 1 legal firm, ~40 cases, users per role, events, documents, payments, costs. No localStorage (preview constraint).
- **RBAC:** `useCurrentUser()` + `scopedCases(user)` selector. All list/detail reads go through selectors that filter by org. A role-switcher in the top bar (demo aid).
- **State machine:** `allowedTransitions(status, role)` map. Status control only shows valid next states. Every mutation writes a `CaseEvent`.
- **Integration seam:** `src/lib/integrations/adapter.ts` with `IntegrationAdapter` interface + `MockAdapter`. V2 modules render as disabled "запланировано (V2)" pages.

## Routes (TanStack file-based)

```
/                       → redirect to /login (or shell)
/login                  → role picker (demo)
/_app                   → shell with sidebar + topbar (tagline)
  /control-tower        → Bank Admin KPIs, funnel, leaderboard, attention queue
  /portfolio/upload     → CSV/Excel-like paste + validation report
  /cases                → filterable list, bulk assign
  /cases/$id            → Case Detail (timeline, tabs, state control, routing widget)
  /assignments          → marketplace / reassign
  /agencies             → agency analytics (4 dimensions)
  /roi                  → Legal ROI Calculator
  /audit                → audit log
  /my-cases             → Collector/Legal Firm workspace
  /transfers            → Manager/Accountant approval queue
  /court                → court tracking board
  /mib                  → V2 stub
  /integrations         → V2 stub list
```

## Design system

Dark command-center: bg `#0B1F2A`, surface `#12303E`, mist work areas `#EEF3F4`, accents lime `#B8E04A` (active), amber `#E8A33D` (money), red `#C0504D` (problem). Fonts: Manrope (display), IBM Plex Sans (body), IBM Plex Mono (IDs/figures) via Google Fonts `<link>` in `__root.tsx`. Semantic tokens in `src/styles.css`.

## Screens shipped

1. Login / role switch
2. Control Tower (KPIs, DPD buckets, status funnel, agency leaderboard, SLA breaches, attention queue, cost-to-recover)
3. Portfolio Upload with validation (missing ПИНФЛ, bad amounts, dupes)
4. Cases list with filters + bulk reassign
5. Case Detail (header, spine PRE→COURT→POST, timeline, state control with reason modal for destructive actions, tabs: Документы / Платежи / Затраты / SLA / Назначения / Аудит, routing widget notary vs court)
6. Assignment marketplace
7. Agency analytics
8. Legal ROI calculator
9. Audit log
10. Collector workspace (My cases + log contact/promise)
11. Legal firm workspace + document generator (template picker → HTML preview → attach)
12. Transfer approval chain (Collector→Manager→Accountant)
13. Court tracking (manual)
14. MIB + Integrations as V2 stubs

## Seven flows (all clickable, all audited)

1. Upload portfolio → validate → create cases
2. Assign → collector logs promise → status/timeline updates
3. Escalate to legal → generate court doc → filed → decision
4. Enforcement routing (notary vs court)
5. Recovery approval chain → Paid → Closed
6. ROI calc → propose restructure
7. Reassign underperformer with mandatory reason

## Non-goals (stubbed)

Real E-SUD/MIB/notary/ABS/E-IMZO, real payments, native mobile.

## Deliverables

- Seeded, running app with role switcher
- All 7 flows wired end-to-end writing `CaseEvent`s
- Server-side-style RBAC via selectors (single source of truth)
- README covering data model, adapter seam, V1 vs V2
