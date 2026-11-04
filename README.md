# Nodus

Nodus is a QR-based business billing and stablecoin checkout concept. Restaurants create an itemized bill, customers scan a QR code and review the amount before authorizing payment, and the platform verifies settlement before marking the bill paid and making a digital receipt available.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Satin Ridges

The landing page uses an original WebGL satin-fabric background in `src/components/satin-ridges.tsx`. It is implemented in this repository and has no third-party component registry, license key, authorization header, or paid dependency.

The component exposes the full configuration surface: colors, backgroundColor, angle, scale, depth, warp, detail, gloss, highlight, sheen, lightAngle, flow, speed, interactive, swell, swellRadius, clickRipples, seed, paused, dpr, className, style, and children.

## Product scope

This repository currently contains the marketing landing page and the reusable interactive background component. It does not yet process payments or connect to NEAR Intents. Those integrations require a separate backend and careful end-to-end testing before any real funds are handled.
