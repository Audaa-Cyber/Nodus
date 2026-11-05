# Nodus design system

Status: active
Scope: public marketing site and embedded checkout preview
Reference: the user's dot-matrix hero direction

## Design intent

The site should read as one designed object, not a collection of generated sections. The hero's warm-white editorial direction is the source of truth for every section below it.

The visual language comes from the product: an invoice is a precise record, a QR is a compact doorway, and settlement is a clear final state. Use that logic in layout, typography, diagrams, and interaction.

## Visual tokens

- Canvas: warm near-white `#f7f7f5`
- Primary ink: `#111111`
- Secondary text: `#777777`
- Tertiary text: `#999999`
- Rules: black at 14% opacity
- Accent: neutral greys only
- Typography: Inter for all UI and display text
- Display type: medium weight, tight tracking, deliberate line breaks
- Body: 13–14px desktop, 12–13px compact screens, line-height 1.7–1.85
- Controls: black fill, white text, restrained borders
- Surfaces: warm canvas and white for the invoice
- Shadows: subtle separation for the invoice preview only

## Layout principles

- Preserve the hero's centered composition and generous negative space.
- Use the same max-width container and consistent horizontal gutters throughout.
- Sections may vary in composition, but not in visual language.
- Prefer editorial columns, large type, thin rules, and purposeful whitespace over repeated cards.
- Explain the payment flow as a clear sequence, not a generic feature-card grid.
- Keep the checkout preview believable and legible. It is a product illustration, not a fake live integration.
- On mobile, stack content in reading order and retain generous touch targets.

## Motion and interaction

- Motion must communicate feedback, state, or spatial continuity. If instant state change is equally clear, prefer instant.
- Keep the dot-matrix animation as the hero's signature.
- Buttons use fast press feedback and restrained hover color changes. Avoid blanket `transition: all`.
- The invoice breakdown uses a short grid-row reveal; the menu opens from its own location and closes on Escape.
- Copy feedback stays on the copy control. No unnecessary toast.
- The hero canvas pauses when the document is hidden and renders once when reduced motion is requested.
- Respect `prefers-reduced-motion` across the page.
- Never imply that a demo payment moved funds or was verified on-chain.

## Anti-patterns

- No alternating unrelated dark/light themes.
- No default SaaS three-card feature strip.
- No gradients, glassmorphism, oversized glows, random rounded cards, or decorative icon tiles.
- No mixing serif editorial typography with Inter in the same page.
- No tiny body copy used as visual texture.
- No invented customer logos, testimonials, transaction metrics, or payment claims.
- No fake settlement-success state in the interactive preview.

## Product truth

Nodus is an invoice and QR checkout concept for business payments with stablecoins. The landing page demonstrates the customer flow only. Its payment action is explicitly simulated; it does not connect a wallet, submit a transaction, move funds, or verify settlement. A live product must verify the transaction on the relevant network before closing an invoice.
