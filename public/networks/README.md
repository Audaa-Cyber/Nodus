# Overview network marks

Local assets used by `NetworkLogo`. Network keys and labels remain defined in
`src/lib/wallet/networks.ts`. No runtime requests to brand sites are needed.

- Ethereum: local faceted diamond SVG, matching the gray diamond in the
  [official Ethereum assets](https://ethereum.org/assets/).
- Base: `The Square/Base_square_blue.svg` from the
  [official brand archive](https://brand.base.org/base-brand.zip), unchanged.
  The current Base mark is the blue Square.
- Arbitrum: [Offchain Labs tutorial logo](https://raw.githubusercontent.com/OffchainLabs/arbitrum-tutorials/master/assets/logo.svg).
  Only the viewBox is cropped to the hexagon's bounds.
- Optimism: the blockchain symbol from the [official brand page](https://optimism.io/brand),
  [source SVG](https://cdn.sanity.io/images/y6ka751a/production/0619395edc911805bcea3268156418134c1c5b32-2500x1875.svg).
  The presentation background is removed and the viewBox cropped to the mark.
- Arc: icon served by the [official Arc site](https://www.arc.network),
  [source SVG](https://cdn.prod.website-files.com/685311a976e7c248b5dfde95/699e21e934a48439675361dc_arc-icon.svg).
  Its white fill is changed to dark gray for the Overview's light background;
  the path and proportions are unchanged.

Brand marks remain the property of their respective owners. Unknown, missing,
and aggregate network values use a neutral globe from the existing Lucide package.
