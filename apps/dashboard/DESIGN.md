# Gaitway visual direction: "Fare Gate"

Every screen follows this file. If a screen needs something not covered
here, extend this system in its own spirit; do not import another look.

## The idea

Gaitway is a gate that money passes through. The interface borrows from
the physical world of gates and fares: transit turnstiles, paper tickets
with punched holes and perforated stubs, departure boards with rolling
digits, and the engraved line patterns on banknotes.

- A **wallet** is a pass.
- A **payment credential** is a ticket. Each charge punches it.
- A **payment** is a token travelling through a gate. Approved, the gate
  opens and it lands with the seller. Refused, the gate stays shut and the
  token bounces back.

The feeling: calm, exact, mechanical, a little playful. A well-made
machine, not a crypto app and not a bank brochure.

## Colour

Semantic tokens, defined once as CSS variables in `app/globals.css` and
mapped into Tailwind. Components never use raw hex.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#EEF2EA` | App background (light surfaces) |
| `--card` | `#FBFCF8` | Cards and tickets on paper |
| `--ink` | `#0B1F24` | Text; also the dark surface for hero and demo |
| `--ink-soft` | `#4A5F63` | Secondary text on paper |
| `--line` | `rgba(11,31,36,0.14)` | Hairlines, perforations |
| `--pass` | `#2F4BFF` | Primary action, links, focus ring, the money token |
| `--go` | `#12A66A` | Approved, paid, confirmed (text-safe on paper) |
| `--go-bright` | `#3DDC97` | Same meaning on ink surfaces |
| `--stop` | `#E8452A` | Refused, error, destructive |
| `--hold` | `#B97800` | On hold, pending (text-safe); `#FFB020` on ink |

On ink surfaces text is `#EEF2EA` and secondary text is `#9DB2B0`.

Two surfaces only: **paper** (dashboards, forms, docs) and **ink** (landing
hero, the `/demo` screen, the sidebar). Colour never carries meaning
alone: approved and refused always have an icon and a word as well.

## Type

Loaded with `next/font/google`.

| Role | Face | Use |
|---|---|---|
| Display | **Big Shoulders Display**, 700 to 900, uppercase | Page titles, big balances, gate signage. Condensed, like station signs. Tracking `-0.01em` at large sizes, `0.04em` on small caps labels |
| Body | **Onest**, 400 / 500 / 600 | Everything people read or click |
| Data | **JetBrains Mono**, 400 / 500, tabular figures | Amounts in tables, IDs, keys, code |

Scale (px): 12, 14, 16, 18, 24, 32, 48, 72, 112. Body is 16 with line
height 1.55. Display line height 0.95. Eyebrow labels are Onest 12, 600,
uppercase, tracking `0.08em`, in `--ink-soft`.

Money: dollars in Display, cents smaller and raised; in tables, mono with
tabular figures, right-aligned.

## Shape and texture

- **Ticket cards.** Wallets and credentials are tickets: a card with two
  semicircular notches cut from the left and right edges (CSS `mask` with
  radial gradients) and a dashed perforation line between the notches
  separating the body from a stub. The stub holds the ID in mono.
- **Punches.** A credential shows a row of small circles; each charge
  fills one in with a quick punch animation.
- **Guilloche.** Banknote-style engraved line rosettes, drawn as SVG
  paths (many thin rotated ellipses or epitrochoid curves), at 6 to 10
  percent opacity, behind hero text and inside wallet tickets. One
  reusable `<Guilloche />` component. It rotates very slowly (one turn
  in 120 seconds); it is still under reduced motion.
- Ordinary cards: 14px radius, 1px `--line` border, no drop shadow on
  paper. Elevation (dialogs, popovers) uses one shadow:
  `0 12px 32px -12px rgba(11,31,36,0.28)`.
- Buttons: 10px radius, 44px tall. Primary is `--pass` with white text.
- Icons: `lucide-react` only, 1.75 stroke, 20px. No emoji.
- Spacing on a 4px grid: 4, 8, 12, 16, 24, 32, 48, 72, 112.

## The signature: the gate lane

One component, `<GateLane />`, used in the landing hero and as the centre
of `/demo`.

```
  AGENT PASS             GATE              SELLER
 ┌──────────┐                           ┌──────────┐
 │ SCOUT    │   ●  ●   ●   ▐█▌     ●    │ RELAY    │
 │ $49.95   │ ───────────── ║ ───────── │ $0.05    │
 └──────────┘      lane    ▐█▌          └──────────┘
```

- A horizontal lane joins an agent's pass on the left to the seller on
  the right, with a gate (two short vertical bars) in the middle.
- **Approved payment:** a `--pass` token leaves the wallet, the gate bars
  part (rotate open, 160ms), the token passes, lands at the seller with a
  small spring settle, and the seller's balance rolls up. The gate closes
  behind it. A `--go` flash runs along the lane.
- **Refused payment:** the token travels to the gate, the bars stay shut
  and flash `--stop`, the token compresses against them and springs back
  to the wallet with a short shake. The reason appears above the gate as
  a sign: "NOT ENOUGH BALANCE".
- Tokens are driven by real events. Several may be in the lane at once.
- Under reduced motion: no travelling token. The gate changes colour and
  the sign cross-fades in.

## Motion

Library: `motion` (import from `motion/react`). CSS transitions for hover,
press, and colour.

Personality: precise and mechanical, with spring only where something
physical lands or is refused.

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` |
| quick | 120ms: press, hover, toggles |
| standard | 200ms: popovers, row changes, tab indicator |
| slow | 320ms: dialogs, page section entrance |
| default spring | `{ type: "spring", bounce: 0, duration: 0.4 }` |
| landing spring | `{ type: "spring", bounce: 0.2, duration: 0.45 }`: token landing, refusal bounce, ticket punch only |

Rules:

- **Rolling digits.** Every balance uses `<RollingNumber />`: each digit
  is a vertical strip that rolls to its new value like a departure board
  (standard spring, 30ms stagger from the right). Width is fixed with
  tabular figures so nothing shifts. Under reduced motion it cross-fades.
- **Press.** Every pressable element scales to 0.97 on `:active`, 120ms.
- **Entrance.** Page sections rise 12px and fade in, 320ms, staggered
  40ms, total under 400ms. Once per page load, never on data refresh.
- **Lists.** A new feed row slides down from the top and pushes others
  with a layout animation; it does not flash. Rows never animate on a
  routine refresh that changes nothing.
- **Dialogs** scale from 0.96 with fade, centred. **Popovers and menus**
  scale from their trigger (`transform-origin` set to it). Exits are 60
  percent of the entrance duration.
- **Errors** in forms: the field shakes once (3 oscillations, 8px,
  320ms), border turns `--stop`, message appears below.
- **Success** of a money action: the affected balance rolls, and the
  button shows a check for 1.2 seconds.
- Animate `transform` and `opacity` only. Never `transition: all`. Never
  scale from 0. Never ease-in. Nothing over 400ms except the gate lane
  journey (about 900ms end to end) and the guilloche drift.
- Hover effects sit behind `@media (hover: hover) and (pointer: fine)`.
- `prefers-reduced-motion: reduce`: remove movement, keep short fades.

## Layout

- **Dashboards:** an ink sidebar 248px wide (logo, navigation with icon
  and label, test-mode badge, account at the bottom) and a paper content
  area with a max width of 1120px. Below 900px the sidebar becomes a top
  bar with a menu sheet.
- **Page header:** eyebrow label, Display title, one primary action at
  the right.
- **`/demo`:** full-bleed ink, no sidebar. Three columns: agent passes
  (left, 300px), the gate lanes and event feed (centre, fluid), the seller
  (right, 300px). Type sized to read from the back of a room: balances at
  72px, feed rows at 18px.
- **Landing:** ink hero with the live gate lane as the thesis, then paper
  sections.

## Voice

Plain and exact. Sentence case everywhere except Display headings.
Buttons say what happens: "Add money", "Take money back", "Create agent",
"Copy key". Say "balance", "top up", "payout", "agent", "seller". Never
"USDC", "blockchain", "gas", or "on-chain" in the interface, except on the
seller payout-details screen and in developer docs. Errors state what
happened and what to do: "Not enough unallocated balance. Top up first."
Empty states invite the first action. No exclamation marks. Invent no
customers, numbers, or claims.

## Quality floor

Contrast at least 4.5:1 for text. A visible 2px `--pass` focus ring with
2px offset on everything focusable. Targets at least 44px. Works at 375px
wide with no sideways scroll. Every data view has loading (skeleton, not
spinner), empty, and error-with-retry states. Labels on every input.

## Component index

All in `apps/dashboard/components/`, imported as `@/components/<File>`. Live examples of every state: `/styleguide`. Motion tokens: `components/motion-tokens.ts`. Small-text colour variants added to the tokens for 4.5:1 on paper: `go-text`, `stop-text`, `hold-text`; on ink: `pass-bright`, `stop-bright`.

| Component | File | Props |
|---|---|---|
| Button, ButtonLink, useSuccessFlash | Button.tsx | `variant` primary/secondary/ghost/danger, `size` md/lg, `loading`, `success`, `icon`, `iconAfter`, `block`, `onInk`; ButtonLink adds Link props; `useSuccessFlash()` → `[on, flash]` |
| Input, Textarea | Input.tsx | input props plus `prefix`, `suffix`, `mono`, `invalid`, `revealable` (password), `onInk` |
| Field, useField | Field.tsx | `label`, `helper`, `error` (shakes), `errorKey`, `aside`, `optional`, `hideLabel`, `onInk`, `children` |
| Card | Card.tsx | `tone` card/ink, `padding` none/sm/md/lg, `as`, `title`, `actions` |
| TicketCard | TicketCard.tsx | `children` (body), `stub`, `tone` card/ink/pass, `guilloche`, `interactive`, `as`, `bodyClassName`, `stubClassName` |
| Punches | Punches.tsx | `total`, `used`, `tone`, `label` |
| Table, Column | Table.tsx | `columns` ({key, header, cell, numeric, align, hideBelow, width}), `rows`, `getRowId`, `label`, `loading`, `error`, `onRetry`, `empty`, `onRowClick`, `animateNewRows`, `dense` |
| Money | Money.tsx | `micros`, `variant` display/mono/text, `size` sm/md/lg/xl/2xl, `rolling`, `signed` |
| RollingNumber | RollingNumber.tsx | `value` (formatted string), `stagger`, `label` |
| Badge, StatusBadge, TestModeBadge | Badge.tsx | Badge: `tone`, `icon`, `onInk`; StatusBadge: `status` (any contract status, approved, refused); TestModeBadge: `onInk` |
| Dialog | Dialog.tsx | `open`, `onClose`, `title`, `description`, `footer`, `size` sm/md/lg, `dismissable`, `initialFocus` |
| Popover, Menu | Popover.tsx | Popover: `trigger(props, open)`, `children` or `(close) => node`, `align`, `side`, `width`, `role`, `onInk`; Menu adds `items` ({label, icon, onSelect, href, tone, separated, disabled}), `header` |
| EmptyState | EmptyState.tsx | `icon`, `title`, `body`, `action`, `size` |
| ErrorState, RouteError | ErrorState.tsx, RouteError.tsx | `title`, `message`, `onRetry`, `retryLabel`, `code`, `size`; RouteError is the body for `error.tsx` |
| Skeleton, SkeletonText | Skeleton.tsx | `shape` line/block/circle, `onInk`; SkeletonText: `lines`, `label` |
| CopyOnce, CopyButton | CopyOnce.tsx | CopyOnce: `value`, `label`, `warning`, `onCopied`; CopyButton: `value`, `label`, `showText`, `onInk` |
| Guilloche | Guilloche.tsx | `variant` rosette/seal/band, `size`, `opacity`, `drift`, `reverse`, `strokeWidth` |
| PageHeader | PageHeader.tsx | `eyebrow`, `title`, `description`, `action`, `meta` |
| SectionReveal | SectionReveal.tsx | `children` (each child staggers), `stagger`, `as` |
| Toast, Toaster | Toast.tsx | `toast(title, {tone, body, duration})`, `toast.success`, `toast.error`, `toast.dismiss`; `<Toaster />` is in the root layout |
| Logo, GateMark | Logo.tsx | `onInk`, `size` |
| BusinessShell, SellerShell, Shell | BusinessShell.tsx, SellerShell.tsx, Shell.tsx | `account` {name, email}, `testMode`, `children`; Shell also takes `area`, `nav` |
| GateLane | GateLane.tsx | `pass` and `seller` ({name, balanceMicros, label, id}), `journeys` ({id, outcome, reason, amountMicros}[]), `size` md/lg, `showLabels`, `onJourneyEnd`; ref: `approve({amountMicros})`, `refuse(reason, {amountMicros})`, `clear()` |
