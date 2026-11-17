"use client";

import { useId, useMemo, useState } from "react";
import { formatAnimatedUsdcBaseUnits, formatUsdcBaseUnits } from "@/lib/payments/nodus-received-balance";
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
const Rb = 24;
const Rbc = 169;

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
        sharePercent: total > 0n
          ? Math.min(100, Number(BigInt(totalUnits) * 100_000_000_000_000n / total) / 1_000_000_000_000)
          : 0,
      };
    });
  }, [chains, total]);

  const activeKey = hoveredKey ?? focusedKey ?? (selectedNetwork && selectedNetwork !== "all" ? selectedNetwork : null);
  const activeChain = activeKey ? networkChains.find((c) => c.networkKey === activeKey) ?? null : null;

  const targetAmount = activeChain ? activeChain.totalBaseUnits : totalBaseUnits;
  const targetIdentity = activeKey ?? "all";

  const safeBigIntAmount = useMemo(() => {
    try {
      return BigInt(targetAmount || "0");
    } catch {
      return 0n;
    }
  }, [targetAmount]);

  const { displayed, changed } = useAnimatedInteger(safeBigIntAmount, targetIdentity, 1700, Boolean(activeChain));

  const formattedAmount = formatAnimatedUsdcBaseUnits(displayed, safeBigIntAmount);
  const targetFormattedAmount = formatUsdcBaseUnits(safeBigIntAmount.toString());
  // Size for the final amount, so growing digits never resize or stretch text.
  const amountFontSize = Math.min(28, 164 / ((targetFormattedAmount.length + 5) * 0.62));
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
                <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="-4" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.18" />
                </filter>
                <filter id={badgeShadowId} x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000000" floodOpacity="0.16" />
                </filter>
                <filter id={centerShadowId} x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000000" floodOpacity="0.10" />
                </filter>
              </defs>

              {/* Background baseline ring */}
              <circle
                cx="250"
                cy="250"
                r="224"
                fill="none"
                strokeWidth="1"
                className={total > 0n ? "overview-donut-bg-ring" : "overview-donut-empty-ring"}
              />

              {/* 5 Petal Segments with Stationary Hitboxes and Bouncy Springs */}
              <g className={`overview-donut-petals-group ${activeKey ? "has-active" : ""}`}>
                {networkChains.map((item) => {
                  const isSelected = activeKey === item.networkKey;
                  // Positions are local: the parent rotates the complete petal.
                  const bPos = polar(Rbc, 0);
                  const tPos = polar(194, -29);

                  return (
                    <g
                      key={item.networkKey}
                      transform={`rotate(${item.angle} 250 250)`}
                      className={`overview-donut-segment-item ${isSelected ? "is-selected" : ""}`}
                      tabIndex={0}
                      role="button"
                      aria-pressed={selectedNetwork === item.networkKey}
                      aria-label={`${item.networkLabel}: ${item.formattedAmount} USDC (${item.share})`}
                      onFocus={() => setFocusedKey(item.networkKey)}
                      onBlur={() => setFocusedKey(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectNetwork(item.networkKey);
                        }
                      }}
                    >
                      {/* Stationary transparent Hitbox (Prevents hover jitter / boundary flutter) */}
                      <path
                        d={SWIRL_PETAL_D}
                        className="overview-donut-hitbox"
                        onClick={() => onSelectNetwork(item.networkKey)}
                        onPointerEnter={() => setHoveredKey(item.networkKey)}
                        onPointerLeave={() => setHoveredKey(null)}
                      />

                      {/* Visual Layer with Bouncy Spring (Pointer events disabled) */}
                      <g className="overview-donut-visual-petal" filter={`url(#${shadowId})`}>
                        <path d={SWIRL_PETAL_D} fill={item.color} />

                        {/* White Badge with Brand Original Logo */}
                        <g transform={`translate(${bPos.x}, ${bPos.y})`} filter={`url(#${badgeShadowId})`}>
                          <circle r={Rb} fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
                          <image
                            transform={`rotate(${-item.angle})`}
                            href={getNetworkLogoSrc(item.networkKey) ?? ""}
                            x="-13"
                            y="-13"
                            width="26"
                            height="26"
                            preserveAspectRatio="xMidYMid meet"
                          />
                        </g>

                        {/* On-Petal Details: Only Reveal on Hover */}
                        <g transform={`translate(${tPos.x}, ${tPos.y}) rotate(${-item.angle})`}>
                          <g
                            fill={["arbitrum-sepolia", "optimism-sepolia", "sepolia"].includes(item.networkKey) ? "#171717" : "#ffffff"}
                            textAnchor="middle"
                            className="overview-donut-petal-details"
                          >
                            <text y="-8" fontSize="13" fontWeight="700">{item.shortName}</text>
                            <text
                              y="8"
                              fontSize={Math.min(13, 90 / (item.formattedAmount.length * 0.62))}
                              fontWeight="600"
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >{isSelected ? formattedAmount : item.formattedAmount}</text>
                            <text y="22" fontSize="10" fontWeight="500">USDC ({item.share})</text>
                          </g>
                        </g>
                      </g>
                    </g>
                  );
                })}
              </g>

              {/* Unstoppable Orbiting Radar Halo */}
              <circle
                cx="250"
                cy="250"
                r="102"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="1.5"
                strokeDasharray="4 6"
                className="overview-donut-orbit-halo"
                pointerEvents="none"
                aria-hidden="true"
              />

              {/* Center Disk Hub */}
              <g pointerEvents="none" aria-hidden="true" filter={`url(#${centerShadowId})`}>
                <circle cx="250" cy="250" r={Rc} fill="#ffffff" />
                <circle cx="250" cy="250" r={Rc - 1} fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.5" />

                <text
                  x="250"
                  y="218"
                  textAnchor="middle"
                  fontWeight="600"
                  fontSize="12"
                  fill="#64748b"
                  letterSpacing="0.06em"
                >
                  {activeChain ? activeChain.networkLabel.toUpperCase() : "TOTAL RECEIVED"}
                </text>

                <text
                  x="250"
                  y="252"
                  textAnchor="middle"
                  fontWeight="700"
                  fontSize={amountFontSize}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                  fill={changed ? "#16a34a" : "#0f172a"}
                  letterSpacing="-0.03em"
                >
                  {formattedAmount} USDC
                </text>

                {/* 5 Indicator Dots */}
                <g transform="translate(250, 272)">
                  {networkChains.map((c, i) => (
                    <circle
                      key={`drop-${c.networkKey}`}
                      cx={(i - 2) * 9}
                      cy="0"
                      r={activeKey === c.networkKey ? 4 : 2.5}
                      fill={total === 0n ? "#cbd5e1" : c.color}
                      style={{ transition: "r 200ms ease" }}
                    />
                  ))}
                </g>

                <text
                  x="250"
                  y="292"
                  textAnchor="middle"
                  fontWeight="600"
                  fontSize="11"
                  fill="#64748b"
                >
                  {activeChain ? `${activeChain.share} OF TOTAL` : total === 0n ? "0 USDC" : "100% OF TOTAL"}
                </text>
              </g>
            </svg>

            {/* Accessibility Live Region */}
            <div className="sr-only" role="status" aria-live="polite">
              <span>Total Received: {totalAmount} USDC</span>
              {activeChain && <span>Selected: {activeChain.networkLabel} with {activeChain.formattedAmount} USDC</span>}
            </div>
          </div>

          <p className="overview-donut-total">
            Total received <strong>{totalAmount} USDC</strong>
          </p>
          <button
            type="button"
            className="overview-donut-reset"
            onClick={() => onSelectNetwork("all")}
            disabled={!selectedNetwork || selectedNetwork === "all"}
          >
            All networks
          </button>
        </div>

        {/* Legend matching your screenshot */}
        <ul className="overview-donut-legend" aria-label="Network balances">
          {networkChains.map((chain) => {
            const isSelected = activeKey === chain.networkKey;
            return (
              <li
                key={chain.networkKey}
                className={`overview-donut-legend-row ${isSelected ? "is-selected" : ""}`}
                onPointerEnter={() => setHoveredKey(chain.networkKey)}
                onPointerLeave={() => setHoveredKey(null)}
              >
                <button
                  type="button"
                  className="overview-legend-select"
                  onFocus={() => setFocusedKey(chain.networkKey)}
                  onBlur={() => setFocusedKey(null)}
                  onClick={() => onSelectNetwork(chain.networkKey)}
                  aria-pressed={selectedNetwork === chain.networkKey}
                  aria-label={`${chain.networkLabel}: ${chain.formattedAmount} USDC, ${chain.share} of total`}
                >
                  {/* Proportional live progress bar underlay */}
                  <div
                    className="overview-legend-progress-bar"
                    style={{
                      backgroundColor: chain.color,
                      width: `${chain.sharePercent}%`,
                    }}
                  />

                  {/* Line 1: Glowing Indicator Dot + Official Brand Logo + Network Label */}
                  <div className="overview-legend-top-line">
                    <span
                      className="overview-legend-live-dot overview-legend-color-dot"
                      style={{ backgroundColor: chain.color, color: chain.color }}
                      aria-hidden="true"
                    />
                    <span className="overview-legend-logo-box">
                      <NetworkLogo networkKey={chain.networkKey} size="sm" />
                    </span>
                    <span className="overview-legend-name">{chain.networkLabel}</span>
                  </div>

                  {/* Line 2: Indented Amount on Left, Percentage Share on Right */}
                  <div className="overview-legend-bottom-line">
                    <span className="overview-legend-amount">{isSelected ? formattedAmount : chain.formattedAmount} USDC</span>
                    <span className="overview-legend-pct">{chain.share}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="overview-donut-caption">
        Verified receipts and share of the total.
      </p>
    </div>
  );
}
