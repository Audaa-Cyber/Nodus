"use client";

import { useId, useMemo, useState } from "react";
import { formatUsdcBaseUnits } from "@/lib/payments/nodus-received-balance";
import { formatNetworkShare, getNetworkColor } from "@/lib/dashboard/network-distribution";
import { NetworkLogo } from "@/components/network-logo";
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

const Rc = 82;      // Center disk radius
const Rb = 32;      // White circular badge radius
const Rbc = 142;    // Distance of badge from center
const badgeAngle = 18; // Badge sits at +18 deg from step center
const Ro = 208;     // Circular outer radius

/**
 * 5-segment swirling teardrop petal geometry matching the reference infographic:
 * - A sharp beak tip extending counter-clockwise to overlap the previous petal
 * - An inner concave curve wrapping cleanly around the previous step's white circular badge
 * - An inner circular boundary resting flush against the central white hub
 * - A smooth trailing curve returning to the outer radius
 * - An exact circular arc contour on the outer perimeter
 */
function makeSwirlPetalD() {
  const pTip = polar(210, -38);
  
  // Concave curve wrapping around previous badge (badge center at -54 deg, dist 142):
  const cBeakInner1 = polar(186, -45);
  const cBeakInner2 = polar(168, -60);
  const pBadgeMid = polar(140, -68);

  const cInner1 = polar(114, -66);
  const cInner2 = polar(98, -54);
  const pCenterStart = polar(Rc, -46);

  // Center circle arc from -46 deg to +26 deg:
  const pCenterEnd = polar(Rc, 26);

  // Trailing curve to outer radius:
  const cTrail1 = polar(Rc + 30, 36);
  const cTrail2 = polar(130, 48);
  const pOuterEdge = polar(Ro, 52);

  // Outer circular arc to beak tip:
  const pOuterPreTip = polar(Ro, -34);

  return `
    M ${pTip.x.toFixed(2)} ${pTip.y.toFixed(2)}
    C ${cBeakInner1.x.toFixed(2)} ${cBeakInner1.y.toFixed(2)},
      ${cBeakInner2.x.toFixed(2)} ${cBeakInner2.y.toFixed(2)},
      ${pBadgeMid.x.toFixed(2)} ${pBadgeMid.y.toFixed(2)}
    C ${cInner1.x.toFixed(2)} ${cInner1.y.toFixed(2)},
      ${cInner2.x.toFixed(2)} ${cInner2.y.toFixed(2)},
      ${pCenterStart.x.toFixed(2)} ${pCenterStart.y.toFixed(2)}
    A ${Rc} ${Rc} 0 0 1 ${pCenterEnd.x.toFixed(2)} ${pCenterEnd.y.toFixed(2)}
    C ${cTrail1.x.toFixed(2)} ${cTrail1.y.toFixed(2)},
      ${cTrail2.x.toFixed(2)} ${cTrail2.y.toFixed(2)},
      ${pOuterEdge.x.toFixed(2)} ${pOuterEdge.y.toFixed(2)}
    A ${Ro} ${Ro} 0 0 0 ${pOuterPreTip.x.toFixed(2)} ${pOuterPreTip.y.toFixed(2)}
    L ${pTip.x.toFixed(2)} ${pTip.y.toFixed(2)}
    Z
  `;
}

const SWIRL_PETAL_D = makeSwirlPetalD();

// Fixed 5-network cycle order (clockwise: 01 Base -> 02 Arbitrum -> 03 Optimism -> 04 Arc -> 05 Ethereum)
const DEFAULT_5_NETWORKS = [
  { networkKey: "base-sepolia", networkLabel: "Base Sepolia", step: "01", shortName: "Base", glyph: "base" },
  { networkKey: "arbitrum-sepolia", networkLabel: "Arbitrum Sepolia", step: "02", shortName: "Arbitrum", glyph: "arb" },
  { networkKey: "optimism-sepolia", networkLabel: "Optimism Sepolia", step: "03", shortName: "Optimism", glyph: "op" },
  { networkKey: "arc-testnet", networkLabel: "Arc Testnet", step: "04", shortName: "Arc", glyph: "arc" },
  { networkKey: "sepolia", networkLabel: "Ethereum Sepolia", step: "05", shortName: "Ethereum", glyph: "eth" },
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

  // Merge full 5-network schema with available chains
  const full5Chains = useMemo(() => {
    return DEFAULT_5_NETWORKS.map((meta, idx) => {
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
  const activeChain = activeKey ? full5Chains.find((c) => c.networkKey === activeKey) ?? null : null;

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
                {/* Petal overlapping shadow */}
                <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="-3" dy="5" stdDeviation="5" floodColor="#051b34" floodOpacity="0.28" />
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
                r={Ro}
                fill="none"
                strokeWidth="12"
                className={total > 0n ? "overview-donut-bg-ring" : "overview-donut-empty-ring"}
              />

              {/* 5 Swirling Petals rendered in reverse counter-clockwise order for natural overlapping shadows */}
              <g id="petals">
                {[...full5Chains].reverse().map((item) => {
                  const isSelected = activeKey === item.networkKey;
                  const isDimmed = activeKey !== null && !isSelected;
                  const fillColor = total === 0n ? "#e2e8f0" : item.color;

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
                      style={{ cursor: "pointer", transition: "opacity 160ms ease, transform 160ms ease" }}
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

              {/* Circular Inset Badges and Text on each Petal */}
              <g id="badges-and-labels">
                {full5Chains.map((item) => {
                  const bPos = polar(Rbc, item.angle + badgeAngle);
                  const tPos = polar(146, item.angle - 16);
                  const isSelected = activeKey === item.networkKey;
                  const badgeStroke = total === 0n ? "#cbd5e1" : item.color;

                  return (
                    <g
                      key={`badge-${item.networkKey}`}
                      onClick={() => onSelectNetwork(item.networkKey)}
                      onPointerEnter={() => setHoveredKey(item.networkKey)}
                      onPointerLeave={() => setHoveredKey(null)}
                      style={{ cursor: "pointer" }}
                    >
                      {/* White Inset Circular Badge */}
                      <g transform={`translate(${bPos.x.toFixed(1)}, ${bPos.y.toFixed(1)}) ${isSelected ? "scale(1.08)" : ""}`} filter={`url(#${badgeShadowId})`}>
                        <circle cx="0" cy="0" r={Rb} fill="#ffffff" />
                        <circle cx="0" cy="0" r={Rb - 1} fill="#ffffff" stroke="#f1f5f9" strokeWidth="1.5" />
                        <circle cx="0" cy="0" r={Rb - 5} fill="#f8fafc" />
                        {/* Native Vector Chain Logo inside badge */}
                        {item.glyph === "base" && (
                          <g>
                            <circle cx="0" cy="0" r="14" fill={badgeStroke} />
                            <circle cx="0" cy="0" r="6" fill="#ffffff" />
                          </g>
                        )}
                        {item.glyph === "arb" && (
                          <g>
                            <circle cx="0" cy="0" r="14" fill={badgeStroke} />
                            <path d="M-6 6 L0 -7 L6 6 Z" fill="#ffffff" />
                          </g>
                        )}
                        {item.glyph === "op" && (
                          <g>
                            <circle cx="0" cy="0" r="14" fill={badgeStroke} />
                            <text x="0" y="4" textAnchor="middle" fontSize="10" fontWeight="900" fill="#ffffff">OP</text>
                          </g>
                        )}
                        {item.glyph === "arc" && (
                          <g>
                            <circle cx="0" cy="0" r="14" fill={badgeStroke} />
                            <text x="0" y="4.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#ffffff">A</text>
                          </g>
                        )}
                        {item.glyph === "eth" && (
                          <g>
                            <circle cx="0" cy="0" r="14" fill={badgeStroke} />
                            <path d="M0 -7 L5 0 L0 7 L-5 0 Z" fill="#ffffff" />
                          </g>
                        )}
                      </g>

                      {/* Text on Petal surface matching the infographic */}
                      <g transform={`translate(${tPos.x.toFixed(1)}, ${tPos.y.toFixed(1)})`}>
                        <text
                          x="0"
                          y="-7"
                          textAnchor="middle"
                          fontWeight="900"
                          fontSize="15"
                          fill={total === 0n ? "#64748b" : "#ffffff"}
                          letterSpacing="0.02em"
                        >
                          {item.step} <tspan fontSize="9" fontWeight="800">STEP</tspan>
                        </text>
                        <text
                          x="0"
                          y="7"
                          textAnchor="middle"
                          fontSize="9.5"
                          fontWeight="700"
                          fill={total === 0n ? "#94a3b8" : "rgba(255,255,255,0.95)"}
                        >
                          {item.shortName}
                        </text>
                        <text
                          x="0"
                          y="18"
                          textAnchor="middle"
                          fontSize="8"
                          fontWeight="600"
                          fill={total === 0n ? "#94a3b8" : "rgba(255,255,255,0.82)"}
                        >
                          {item.formattedAmount} USDC
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>

              {/* Elevated Center Hub Disk */}
              <g id="center-hub" filter={`url(#${centerShadowId})`}>
                <circle cx="250" cy="250" r={Rc} fill="#ffffff" />
                <circle cx="250" cy="250" r={Rc - 1} fill="#ffffff" stroke="#f1f5f9" strokeWidth="1.5" />

                {/* Subtitle / Title */}
                <text
                  x="250"
                  y="220"
                  textAnchor="middle"
                  fontWeight="900"
                  fontSize="13"
                  fill="#0f172a"
                  letterSpacing="0.02em"
                >
                  {activeChain ? activeChain.networkLabel.toUpperCase() : "TOTAL RECEIVED"}
                </text>

                {/* Animated Amount */}
                <text
                  x="250"
                  y="244"
                  textAnchor="middle"
                  fontWeight="900"
                  fontSize={formattedAmount.length > 10 ? "17" : "21"}
                  fill={changed ? "#187644" : "#0f172a"}
                  letterSpacing="-0.03em"
                >
                  {formattedAmount}
                </text>

                {/* 5 Network Color Droplets from reference image */}
                <g transform="translate(250, 254)">
                  {full5Chains.map((c, i) => (
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
                  y="268"
                  textAnchor="middle"
                  fontWeight="700"
                  fontSize="9.5"
                  fill="#64748b"
                  letterSpacing="0.06em"
                >
                  {activeChain ? `${activeChain.share} OF TOTAL` : total === 0n ? "0 USDC" : "USDC"}
                </text>

                <text
                  x="250"
                  y="279"
                  textAnchor="middle"
                  fontSize="7.5"
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
          {full5Chains.map((chain) => {
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
        Verified invoice receipts across networks. Select a network to explore.
      </p>
    </div>
  );
}
