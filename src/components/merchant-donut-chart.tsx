"use client";

import { useId, useMemo, useState } from "react";
import { formatUsdcBaseUnits } from "@/lib/payments/nodus-received-balance";
import { formatNetworkShare, getNetworkColor } from "@/lib/dashboard/network-distribution";
import { getNetworkLogoSrc, NetworkLogo } from "@/components/network-logo";
import { useAnimatedInteger } from "@/components/use-data-motion";

export type NetworkDonutChain = {
  networkKey: string;
  networkLabel: string;
  totalBaseUnits: string;
  paymentCount: number;
};

export type MerchantDonutChartProps = {
  chains: NetworkDonutChain[];
  totalBaseUnits: string;
  selectedNetwork: string | null;
  onSelectNetwork: (networkKey: string) => void;
};

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return {
    x: 250 + r * Math.cos(a),
    y: 250 + r * Math.sin(a),
  };
}

const Rc = 96;
const Rb = 46;
const Rbc = 169;

// One curved petal, repeated clockwise around the hub. Equal petals are
// network selectors; exact balances and percentages carry the financial data.
const SWIRL_PETAL_D = `
  M 48 122
  Q 128 0 272 10
  C 319 39 321 95 292 128
  C 279 147 264 151 246 154
  A 96 96 0 0 0 162 206
  C 158 151 108 119 48 122
  Z
`;

const NETWORKS = [
  { networkKey: "base-sepolia", networkLabel: "Base Sepolia", shortName: "Base" },
  { networkKey: "arbitrum-sepolia", networkLabel: "Arbitrum Sepolia", shortName: "Arbitrum" },
  { networkKey: "optimism-sepolia", networkLabel: "Optimism Sepolia", shortName: "Optimism" },
  { networkKey: "arc-testnet", networkLabel: "Arc Testnet", shortName: "Arc" },
  { networkKey: "sepolia", networkLabel: "Ethereum Sepolia", shortName: "Ethereum" },
];

export function MerchantDonutChart({
  chains,
  totalBaseUnits,
  selectedNetwork,
  onSelectNetwork,
}: MerchantDonutChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const shadowId = useId();
  const badgeShadowId = useId();
  const centerShadowId = useId();

  const total = useMemo(() => {
    try {
      return BigInt(totalBaseUnits);
    } catch {
      return 0n;
    }
  }, [totalBaseUnits]);

  // Keep every network available, including networks with no receipts.
  const networkChains = useMemo(() => {
    return NETWORKS.map((meta, idx) => {
      const match = chains.find((c) => c.networkKey === meta.networkKey);
      const angle = idx * 72;
      const color = getNetworkColor(meta.networkKey);
      const totalUnits = match?.totalBaseUnits ?? "0";
      const paymentCount = match?.paymentCount ?? 0;
      return {
        ...meta,
        angle,
        color,
        totalBaseUnits: totalUnits,
        paymentCount,
        formattedAmount: formatUsdcBaseUnits(totalUnits),
        share: formatNetworkShare(BigInt(totalUnits), total),
      };
    });
  }, [chains, total]);

  const activeKey = hoveredKey ?? focusedKey ?? (selectedNetwork && selectedNetwork !== "all" ? selectedNetwork : null);
  const activeChain = activeKey ? networkChains.find((c) => c.networkKey === activeKey) ?? null : null;

  const targetAmount = activeChain ? activeChain.totalBaseUnits : totalBaseUnits;
  const targetIdentity = activeKey ?? "all";
  const { displayed, changed } = useAnimatedInteger(BigInt(targetAmount || "0"), targetIdentity, 650);

  const formattedAmount = formatUsdcBaseUnits(displayed.toString());
  const totalAmount = formatUsdcBaseUnits(totalBaseUnits);

  return (
    <div className="overview-donut-wrapper" role="region" aria-label="USDC received across networks">
      <div className="overview-donut-stage">
        <div className="overview-donut-visual">
          <div className="overview-donut-svg-container">
            <svg
              viewBox="0 0 500 500"
              className="overview-donut-svg"
              role="group"
              aria-label={total > 0n ? "Select a network segment" : "No receipts: 0 USDC"}
            >
              <defs>
                <radialGradient id={`${badgeShadowId}-surface`} cx="60%" cy="70%" r="75%">
                  <stop offset="55%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#dce0e4" />
                </radialGradient>
                {/* Petal overlapping shadow */}
                <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="-5" dy="8" stdDeviation="7" floodColor="#171717" floodOpacity="0.24" />
                </filter>
                {/* Inset white badge shadow */}
                <filter id={badgeShadowId} x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000000" floodOpacity="0.20" />
                  <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.08" />
                </filter>
                {/* Elevated center hub shadow */}
                <filter id={centerShadowId} x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000000" floodOpacity="0.16" />
                  <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.10" />
                </filter>
              </defs>

              {/* Background base circle (empty state / baseline) */}
              <circle
                cx="250"
                cy="250"
                r="224"
                fill="none"
                strokeWidth="1"
                className={total > 0n ? "overview-donut-bg-ring" : "overview-donut-empty-ring"}
              />

              {/* 5 Swirling Petals rendered in reverse counter-clockwise order for natural overlapping shadows */}
              <g className="overview-donut-petals">
                {[...networkChains].reverse().map((item) => {
                  const isSelected = activeKey === item.networkKey;
                  const isDimmed = activeKey !== null && !isSelected;
                  const fillColor = item.color;

                  return (
                    <g
                      key={item.networkKey}
                      transform={`rotate(${item.angle} 250 250)`}
                      filter={`url(#${shadowId})`}
                      className={`overview-donut-segment ${isSelected ? "is-active" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                      onClick={() => onSelectNetwork(item.networkKey)}
                      onPointerEnter={() => setHoveredKey(item.networkKey)}
                      onPointerLeave={() => setHoveredKey(null)}
                      onFocus={() => setFocusedKey(item.networkKey)}
                      onBlur={() => setFocusedKey(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectNetwork(item.networkKey);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-pressed={selectedNetwork === item.networkKey}
                      aria-label={`${item.networkLabel}: ${item.formattedAmount} USDC (${item.share})`}
                    >
                      <path d={SWIRL_PETAL_D} fill={fillColor} />
                    </g>
                  );
                })}
              </g>

              {/* Decorations share the petal's hit target underneath. */}
              <g pointerEvents="none" aria-hidden="true">
                {networkChains.map((item) => {
                  const bPos = polar(Rbc, item.angle);
                  const tPos = polar(194, item.angle - 29);
                  const isSelected = activeKey === item.networkKey;
                  const isDimmed = activeKey !== null && !isSelected;
                  return (
                    <g key={`badge-${item.networkKey}`} opacity={isDimmed ? 0.45 : 1}>
                      <g transform={`translate(${bPos.x}, ${bPos.y})`}>
                        <circle r={Rb} fill="#fff" filter={`url(#${badgeShadowId})`} />
                        <circle r={Rb - 2} fill={`url(#${badgeShadowId}-surface)`} stroke={isSelected ? item.color : "#e5e7eb"} strokeWidth={isSelected ? 3 : 1} />
                        <image
                          href={getNetworkLogoSrc(item.networkKey)}
                          x="-25"
                          y="-25"
                          width="50"
                          height="50"
                          preserveAspectRatio="xMidYMid meet"
                        />
                      </g>
                      <g
                        transform={`translate(${tPos.x}, ${tPos.y})`}
                        fill={["arbitrum-sepolia", "optimism-sepolia", "sepolia"].includes(item.networkKey) ? "#171717" : "#fff"}
                        textAnchor="middle"
                      >
                        <text y="-12" fontSize="15" fontWeight="700">{item.shortName}</text>
                        <text
                          y="9"
                          fontSize="15"
                          fontWeight="600"
                          textLength={item.formattedAmount.length > 9 ? 92 : undefined}
                          lengthAdjust="spacingAndGlyphs"
                        >{item.formattedAmount}</text>
                        <text y="25" fontSize="11" fontWeight="500">USDC</text>
                      </g>
                    </g>
                  );
                })}
              </g>

              {/* Elevated Center Hub Disk */}
              <g pointerEvents="none" aria-hidden="true" filter={`url(#${centerShadowId})`}>
                <circle cx="250" cy="250" r={Rc} fill="#ffffff" />
                <circle cx="250" cy="250" r={Rc - 1} fill="#ffffff" stroke="#e5e7eb" strokeWidth="1.5" />

                {/* Subtitle / Title */}
                <text
                  x="250"
                  y="220"
                  textAnchor="middle"
                  fontWeight="600"
                  fontSize="14"
                  fill="#0f172a"
                  letterSpacing="0.02em"
                >
                  {activeChain ? activeChain.shortName : "Total received"}
                </text>

                {/* Animated Amount */}
                <text
                  x="250"
                  y="251"
                  textAnchor="middle"
                  fontWeight="600"
                  fontSize="28"
                  textLength={formattedAmount.length > 9 ? 150 : undefined}
                  lengthAdjust="spacingAndGlyphs"
                  fill={changed ? "#187644" : "#0f172a"}
                  letterSpacing="-0.03em"
                >
                  {formattedAmount}
                </text>

                {/* 5 Network Color Droplets from reference image */}
                <g transform="translate(250, 270)">
                  {networkChains.map((c, i) => (
                    <ellipse
                      key={`drop-${c.networkKey}`}
                      cx={(i - 2) * 8}
                      cy="0"
                      rx="3"
                      ry="2"
                      fill={total === 0n ? "#cbd5e1" : c.color}
                    />
                  ))}
                </g>

                {/* Template / Share Subtext */}
                <text
                  x="250"
                  y="289"
                  textAnchor="middle"
                  fontWeight="700"
                  fontSize="12"
                  fill="#64748b"
                  letterSpacing="0.06em"
                >
                  {activeChain ? `${activeChain.share} OF TOTAL` : total === 0n ? "0 USDC" : "USDC"}
                </text>

                <text
                  x="250"
                  y="305"
                  textAnchor="middle"
                  fontSize="11"
                  fill="#94a3b8"
                >
                  {activeChain ? `${activeChain.paymentCount} settlements` : "Verified receipts"}
                </text>
              </g>
            </svg>

            {/* Hidden live region for accessibility and screen readers */}
            <div className="sr-only" role="status" aria-live="polite">
              <span>Total Received</span>
              <span>{totalAmount} USDC</span>
              {activeChain && <span>Selected network: {activeChain.networkLabel} with {activeChain.formattedAmount} USDC</span>}
            </div>
          </div>

          <p className="overview-donut-total">
            Total received <strong>{totalAmount} USDC</strong>
          </p>
          {total === 0n && (
            <p className="overview-balance-description">
              No verified invoice receipts yet (0 USDC).
            </p>
          )}
          <button
            type="button"
            className="overview-donut-reset"
            onClick={() => onSelectNetwork("all")}
            disabled={!selectedNetwork || selectedNetwork === "all"}
          >
            All networks
          </button>
        </div>

        {/* Legend list matching contracts */}
        <ul className="overview-donut-legend" aria-label="Network balances">
          {networkChains.map((chain) => {
            const isSelected = activeKey === chain.networkKey;
            return (
              <li key={chain.networkKey} className="overview-donut-legend-row">
                <button
                  type="button"
                  className={`overview-donut-legend-item ${isSelected ? "is-selected" : ""}`}
                  onPointerEnter={() => setHoveredKey(chain.networkKey)}
                  onPointerLeave={() => setHoveredKey(null)}
                  onFocus={() => setFocusedKey(chain.networkKey)}
                  onBlur={() => setFocusedKey(null)}
                  onClick={() => onSelectNetwork(chain.networkKey)}
                  aria-pressed={selectedNetwork === chain.networkKey}
                  aria-label={`${chain.networkLabel}: ${chain.formattedAmount} USDC, ${chain.share} of total`}
                >
                  <span className="overview-legend-left">
                    <span
                      className="overview-legend-color-dot"
                      style={{ backgroundColor: chain.color }}
                      aria-hidden="true"
                    />
                    <NetworkLogo networkKey={chain.networkKey} />
                    <span className="overview-legend-name">{chain.networkLabel}</span>
                  </span>
                  <span className="overview-legend-right">
                    <span className="overview-legend-amount">{chain.formattedAmount} USDC</span>
                    <span className="overview-legend-pct">{chain.share}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="overview-donut-caption">
        Each petal represents a network. Select one to view its verified USDC receipts and share of the total.
      </p>
    </div>
  );
}
