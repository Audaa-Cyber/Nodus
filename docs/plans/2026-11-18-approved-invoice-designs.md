# Approved invoice design integration

The user's three HTML files in public are the binding visual specification. They must remain byte-for-byte unchanged. Convert their markup, CSS selectors, and event lifecycles mechanically to React; retain declaration values, layout, text styling, and scroll animation constants. Substitute authoritative application data and existing payment handlers for demo data/timers.

## Shared contract

- CSS lives in src/components/designs/{merchant,payer,scroll}.css, imported by the root layout. Root wrappers are merchant-design, payer-design, scroll-design. All original selectors are scoped mechanically; original class names inside each surface remain intact.
- Shared helper src/lib/invoice-design.ts provides shortValue, networkLabel, explorerLink(network, kind, value), formatDesignMoney, formatDesignDate, validatedHashes, settlementContract(evidence), parseInvoiceItems, and a SellerDetails type. Components may define their own helpers if needed rather than waiting.
- Source sample amounts, names, transaction hashes, wallet balance, and invoice references must never be emitted as real customer data.
- No modifications to payment authorization, reservation, reference saving, reconciliation, or Circle execution behavior. Progress UI must observe existing states and use the existing authorization handler.
- Keep all existing PaymentSuccessCard props and exported ReceiptInfo/LineItem types compatible. Add optional shareToken for authenticated review/receipt actions, and optional founderName/founderTitle/reviewUrl to sellerDetails; render missing optional data without invented values.
- Escrow address comes from settlement evidence (escrow_contract/escrowContract/escrow_contract_address/escrowContractAddress), or an explicitly configured NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS. Do not substitute merchant receiving address or a Circle deposit address as escrow.
- Feedback components and persistence are owned by the controller. Merchant feedback component: CustomerFeedback({invoiceId, customerName?, initialFeedback?}); receipt rating: InvoiceRating({shareToken?, invoiceNumber, reviewUrl?}). Both preserve approved .fb/.stars markup and visual classes; no hardcoded testimonial.
- No agent commits, branch changes, or edits outside its assigned files. Do not spawn other agents.

## Steps

1. Preserve backend queries and integrate merchant layout, sharing, edit/cancel actions, paid verification and invoice item table. Owner: merchant implementer.
2. Preserve public token lookup and Wagmi/Rabby/Circle state; integrate payer sheet, sticky dock, actual wallet balance and state-driven progress modal. Owner: payer implementer.
3. Replace receipt presentation with approved scroll; preserve exact N=10, DUR=850, TURNS=720, progress interpolation, width coupling, keyboard handling and reduced-motion timing. Owner: scroll implementer.
4. Controller: mechanically scope approved CSS, shared helpers, feedback storage and official receipt PDF endpoint; add narrowly scoped database migration only where needed. No remote migration/deployment without explicit authorization.
5. Verify type check, lint, appropriate tests and production build. Compare desktop/mobile rendering to originals and exercise scroll, clipboard, and checkout blocked/recovery states without signing payments.

## Progress

- Initial state: feature branch feat/nodus-editorial-interactive; tracked tree clean; three reference HTML files untracked.
- Ruling: retain provided design exactly, but replace prototype payment simulation with existing live state and render absent facts honestly.
- Ruling: tests that assert obsolete CSS names/markup should be replaced with tests of the approved surface and preserved behavioral boundaries; payment integrity tests must stay intact.
- Merchant implementation and review complete: real active URL/QR, exact approved card order, expiry/revocation cache guards, cancel confirmation, historical receipts, NEAR status and exact USDC fee units. Focused SSR and state tests pass.
- Payer implementation and review complete: approved sheet/dock/modal, existing Wagmi/Rabby handlers, real ERC-20 balance, shared modal focus/inert locks, recovery guards, historical paid recipient and consistent seller metadata. Focused route/dialog/progress tests pass.
- Scroll implementation and review complete: exact SVGs, geometry/timing/retargeting, cleanup, intentional review-link unroll, verified receipt precedence, PDF/Unicode print fallback. Focused motion/render tests pass.
- Shared CSS declaration/keyframe comparison passes. Payer selector isolation excludes nested scrolls before terminal pseudo-elements. Integration resets restore approved button interaction states against legacy global important rules.
- Shared feedback and official receipt APIs implemented with capability/ownership guards, bounded request reader, immutable recipient projection and Unicode-preserving print fallback. API/data tests pass.
- Final optimized Next build passed (Next.js 15.5.29); full project lint passed with no warnings; settled-tree TypeScript checks passed; all 61 test files exited successfully using isolated worker-free execution. Database integration cases skip without the dedicated local PostgreSQL URL/psql.
- The live-payment handleAuthorizePayment body and fetchRoutes callback compare unchanged to HEAD using TypeScript AST printing; payment integrity, recovery and reference persistence suites pass.
- Verification constraint: Node worker creation is blocked by the sandbox and automatic escalation review failed internally. Direct worker-free test-file execution works and preserves file isolation.
- Verification constraint: CUA browser initialization was not executed because automatic approval review failed with content-blocked. Browser screenshots and desktop/mobile visual interaction checks remain unavailable until the approval-review service works.
- Deployment dependency: 20261118140000_invoice_design_feedback.sql is written and independently reviewed but not executed locally (no dedicated PostgreSQL/psql available) or remotely. Remote deployment was not part of the request. Missing company/phone/address and founder fields are not invented; existing model supplies only customer name/email and available seller snapshots.
