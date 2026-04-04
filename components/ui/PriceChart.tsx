import { PriceService } from "@/services/price";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

/**
 * Time range options for the chart
 */
type TimeRange = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

interface PriceChartProps {
  /** CoinGecko coin ID (e.g., "ethereum", "usd-coin") */
  coinId?: string;
  /** Token symbol (will be converted to coinId) */
  symbol?: string;
  /** Chart height */
  height?: number;
  /** Show time range selector */
  showTimeRangeSelector?: boolean;
  /** Initial time range */
  initialTimeRange?: TimeRange;
  /** Force refresh - increment to trigger a fresh API call */
  refreshTrigger?: number;
  /** Callback when price changes from scrubbing (future feature) */
  onPriceChange?: (price: number | null) => void;
}

const TIME_RANGE_CONFIG: Record<
  TimeRange,
  { label: string; days: number | "max" }
> = {
  "1H": { label: "1H", days: 1 },
  "1D": { label: "1D", days: 1 },
  "1W": { label: "1W", days: 7 },
  "1M": { label: "1M", days: 30 },
  "1Y": { label: "1Y", days: 365 },
  ALL: { label: "ALL", days: "max" },
};

/**
 * Rainbow-style price chart with smooth gradient fill
 */
export function PriceChart({
  coinId,
  symbol,
  height = 200,
  showTimeRangeSelector = true,
  initialTimeRange = "1W",
  refreshTrigger = 0,
}: PriceChartProps) {
  const [chartData, setChartData] = useState<{
    timestamps: number[];
    prices: number[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>(initialTimeRange);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTrigger, setLastRefreshTrigger] = useState(0);

  // Resolve coinId from symbol if needed
  const resolvedCoinId = useMemo(() => {
    if (coinId) return coinId;
    if (symbol) {
      const symbolMap: Record<string, string> = {
        ETH: "ethereum",
        WETH: "weth",
        USDC: "usd-coin",
        USDT: "tether",
        DAI: "dai",
        WBTC: "wrapped-bitcoin",
        MATIC: "matic-network",
        AVAX: "avalanche-2",
        BNB: "binancecoin",
        LINK: "chainlink",
        UNI: "uniswap",
        AAVE: "aave",
        ARB: "arbitrum",
        OP: "optimism",
      };
      return symbolMap[symbol.toUpperCase()];
    }
    return null;
  }, [coinId, symbol]);

  // Fetch chart data function
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!resolvedCoinId) {
        setLoading(false);
        setError("No coin ID provided");
        return;
      }

      setLoading(true);
      setError(null);

      const config = TIME_RANGE_CONFIG[timeRange];
      const data = await PriceService.getChartData(
        resolvedCoinId,
        config.days,
        forceRefresh,
      );

      if (data) {
        // For 1H, we need to slice the last hour of data
        if (timeRange === "1H") {
          const oneHourAgo = Date.now() - 60 * 60 * 1000;
          const hourData = {
            timestamps: [] as number[],
            prices: [] as number[],
          };
          for (let i = 0; i < data.timestamps.length; i++) {
            if (data.timestamps[i] >= oneHourAgo) {
              hourData.timestamps.push(data.timestamps[i]);
              hourData.prices.push(data.prices[i]);
            }
          }
          setChartData(hourData.timestamps.length > 0 ? hourData : data);
        } else {
          setChartData(data);
        }
      } else {
        setError("Failed to load chart data");
      }

      setLoading(false);
    },
    [resolvedCoinId, timeRange],
  );

  // Fetch on mount and when timeRange changes (uses cache)
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Handle refresh trigger from parent (force refresh)
  useEffect(() => {
    if (refreshTrigger > lastRefreshTrigger) {
      setLastRefreshTrigger(refreshTrigger);
      fetchData(true);
    }
  }, [refreshTrigger, lastRefreshTrigger, fetchData]);

  // Calculate price change
  const priceChange = useMemo(() => {
    if (!chartData?.prices) return null;
    return PriceService.calculatePriceChange(chartData.prices);
  }, [chartData]);

  // Generate SVG path for the line chart
  const { linePath, areaPath, viewBox } = useMemo(() => {
    if (!chartData?.prices || chartData.prices.length < 2) {
      return { linePath: "", areaPath: "", viewBox: "0 0 100 100" };
    }

    const prices = chartData.prices;
    const width = 100;
    const chartHeight = 100;
    const padding = 2;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const points = prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * (width - padding * 2) + padding;
      const y =
        chartHeight -
        padding -
        ((price - minPrice) / priceRange) * (chartHeight - padding * 2);
      return { x, y };
    });

    // Create smooth curve using quadratic bezier
    let line = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      line += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
    }
    // Add final point
    const lastPoint = points[points.length - 1];
    line += ` L ${lastPoint.x} ${lastPoint.y}`;

    // Create area path (line + close to bottom)
    const area = `${line} L ${lastPoint.x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

    return {
      linePath: line,
      areaPath: area,
      viewBox: `0 0 ${width} ${chartHeight}`,
    };
  }, [chartData]);

  const isPositive = priceChange?.isPositive ?? true;
  const chartColor = isPositive ? "#10B981" : "#EF4444";

  if (loading) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator color="#569F8C" size="small" />
      </View>
    );
  }

  if (error || !chartData) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.errorText}>Chart unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Price Change Badge */}
      {priceChange && (
        <View style={styles.changeContainer}>
          <Text style={[styles.changeText, { color: chartColor }]}>
            {PriceService.formatPercentChange(priceChange.changePercent)}
          </Text>
          <Text style={styles.rangeLabel}>
            {TIME_RANGE_CONFIG[timeRange].label}
          </Text>
        </View>
      )}

      {/* Chart */}
      <View style={[styles.container, { height }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={viewBox}
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient
              id="chartGradient"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <Stop offset="0%" stopColor={chartColor} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={chartColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Gradient fill under the line */}
          <Path d={areaPath} fill="url(#chartGradient)" />

          {/* Main line */}
          <Path
            d={linePath}
            fill="none"
            stroke={chartColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>

      {/* Time Range Selector */}
      {showTimeRangeSelector && (
        <View style={styles.timeRangeContainer}>
          {(Object.keys(TIME_RANGE_CONFIG) as TimeRange[]).map((range) => (
            <TouchableOpacity
              key={range}
              style={[
                styles.timeRangeButton,
                timeRange === range && styles.timeRangeButtonActive,
              ]}
              onPress={() => setTimeRange(range)}
            >
              <Text
                style={[
                  styles.timeRangeText,
                  timeRange === range && styles.timeRangeTextActive,
                ]}
              >
                {TIME_RANGE_CONFIG[range].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  container: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  changeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  changeText: {
    fontSize: 16,
    fontWeight: "600",
  },
  rangeLabel: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  errorText: {
    color: "#6B7280",
    fontSize: 14,
  },
  timeRangeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1E2E29",
  },
  timeRangeButtonActive: {
    backgroundColor: "#374151",
  },
  timeRangeText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "500",
  },
  timeRangeTextActive: {
    color: "#FFFFFF",
  },
});

export default PriceChart;
