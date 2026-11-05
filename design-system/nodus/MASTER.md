# Nodus design system

Status: active
Scope: public marketing site and embedded checkout preview
Reference: the Nodus dot-matrix hero supplied by the user

## Design intent

The site should feel like one designed object, not a collection of separately generated sections. The hero's quiet editorial direction is the source of truth for every section below it.

The visual idea comes from the product itself: a bill is a precise record, a QR is a compact doorway, and settlement is a clear final state. Use that language in layout, typography, diagrams, and interaction.

## Visual tokens

- Canvas: warm near-white `#f7f7f5`
- Primary ink: `#111111`
- Secondary text: `#777777`
- Tertiary text: `#999999`
- Rules: black at 14% opacity
- Accent: neutral greys only
- Typography: Inter for all UI and display text
- Display type: medium weight, tight tracking, deliberate line breaks
- Body: 13–14px on desktop, 12–13px on compact screens, line-height 1.7–1.85
- Controls: black fill, white text, restrained borders
- Surfaces: same warm canvas or white for the invoice; no unrelated beige/dark panels
- Shadows: only subtle separation for the invoice preview

## Layout principles

- Preserve the hero's centered composition and generous negative space.
- Use the same max-width container and consistent horizontal gutters throughout.
- Sections may vary in composition, but not in visual language.
- Prefer editorial columns, large type, thin rules, and purposeful whitespace over repeated cards.
- Use numbered steps and clear visual sequences when explaining the payment flow.
- Keep the checkout preview visually believable and legible. It is a product illustration, not a fake live integration.
- On mobile, stack content in reading order and retain generous touch targets.

## Motion and interaction

- Motion must communicate state or spatial continuity, not decorate empty space.
- Keep the dot-matrix animation as the hero's signature.
- Buttons need hover, focus-visible, and active feedback.
- Disclosure controls must expose their state to assistive technology.
- Respect `prefers-reduced-motion`.
- Never imply that a demo payment moved funds or was verified on-chain.

## Anti-patterns

- No alternating unrelated dark/light themes.
- No default SaaS three-card feature strip.
- No gradients, glassmorphism, oversized glows, random rounded cards, or decorative icon tiles.
- No mixing serif editorial typography with Inter in the same page.
- No tiny body copy used as visual texture.
- No invented customer logos, testimonials, transaction metrics, or payment claims.

## Product truth

Nodus is an invoice and QR checkout concept for business payments with stablecoins. The landing page may demonstrate the customer flow, but it must label simulated payment behavior as a demo until real wallet connection, transaction submission, and settlement verification are implemented.
