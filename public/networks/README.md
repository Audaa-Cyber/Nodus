# Overview network marks

Local assets used by `NetworkLogo`. Network keys and labels remain defined in
`src/lib/wallet/networks.ts`. No runtime requests to brand sites are needed.

- Ethereum: the original gray diamond PNG from the
  [official Ethereum assets](https://ethereum.org/assets/),
  [source image](https://ethereum.org/_next/static/media/eth-diamond-black.31u_5ih2w7osr.png).
  Downloaded unchanged, including the original colors and transparency.
- Base: `The Square/Base_square_blue.svg` from the
  [official brand archive](https://brand.base.org/base-brand.zip), unchanged.
  The current Base mark is the blue Square.
- Arbitrum: [Offchain Labs tutorial logo](https://raw.githubusercontent.com/OffchainLabs/arbitrum-tutorials/master/assets/logo.svg).
  Only the viewBox is cropped to the hexagon's bounds.
- Optimism: the blockchain symbol from the [official brand page](https://optimism.io/brand),
  [source SVG](https://cdn.sanity.io/images/y6ka751a/production/0619395edc911805bcea3268156418134c1c5b32-2500x1875.svg).
  The presentation background is removed and the viewBox cropped to the mark.
- Arc: icon extracted from the color-gradient logo linked by the
  [official Arc site](https://www.arc.io),
  [source SVG](https://cdn.prod.website-files.com/685311a976e7c248b5dfde95/692db66fe108e2e715e258f0_logo-color-gradient.svg).
  The icon's first path contour and original blue/purple/rose gradient are
  preserved; the wordmark contours are omitted for the square badge.

The chart uses the gray logo facet (`#8C8C8C`) for Ethereum and deep purple (`#3E2B63`, from
Arc's logo gradient) for Arc to distinguish the networks. These chart accents
do not recolor the logo assets.

Brand marks remain the property of their respective owners. Unknown, missing,
and aggregate network values use a neutral globe from the existing Lucide package.
