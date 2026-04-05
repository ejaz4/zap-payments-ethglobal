import { PriceService } from "@/services/price";
import { useSelectedCurrency } from "@/store/currency";
import { TokenBalance } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { ChainBadgeMini } from "./NetworkSelector";
import type { ChainId } from "@/app/profiles/client";

interface TokenRowProps {
  token: TokenBalance;
  onPress?: () => void;
  showChevron?: boolean;
  showChainBadge?: boolean;
}

export function TokenRow({
  token,
  onPress,
  showChevron = false,
  showChainBadge = true,
}: TokenRowProps) {
  const currency = useSelectedCurrency();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const formattedBalance = parseFloat(token.balanceFormatted).toLocaleString(
    undefined,
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    },
  );

  const formattedValue = token.valueUsd
    ? PriceService.formatValue(token.valueUsd, currency)
    : null;

  const content = (
    <>
      <View style={styles.iconWrapper}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>{token.symbol.charAt(0)}</Text>
        </View>
        {showChainBadge && (
          <View style={styles.chainBadgePosition}>
            <ChainBadgeMini chainId={token.chainId} size="small" />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name}>{token.name}</Text>
        <Text style={styles.balance}>
          {formattedBalance} {token.symbol}
        </Text>
      </View>

      <View style={styles.valueContainer}>
        {formattedValue && <Text style={styles.value}>{formattedValue}</Text>}
        {showChevron && (
          <Ionicons name="chevron-forward" size={20} color="#6B7280" />
        )}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.container}>{content}</View>;
  }

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={1}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20, stiffness: 400 });
        }}
      >
        {content}
      </TouchableOpacity>
    </Animated.View>
  );
}

interface NativeTokenRowProps {
  symbol: string;
  name: string;
  balance: string;
  valueUsd?: number;
  chainId?: ChainId;
  onPress?: () => void;
}

export function NativeTokenRow({
  symbol,
  name,
  balance,
  valueUsd,
  chainId,
  onPress,
}: NativeTokenRowProps) {
  const currency = useSelectedCurrency();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const formattedBalance = parseFloat(balance).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });

  const formattedValue = valueUsd
    ? PriceService.formatValue(valueUsd, currency)
    : null;

  const content = (
    <>
      <View style={styles.iconWrapper}>
        <View style={[styles.iconContainer, styles.nativeIcon]}>
          <Ionicons name="diamond" size={24} color="#FFFFFF" />
        </View>
        {chainId !== undefined && (
          <View style={styles.chainBadgePosition}>
            <ChainBadgeMini chainId={chainId} size="small" />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.balance}>
          {formattedBalance} {symbol}
        </Text>
      </View>

      <View style={styles.valueContainer}>
        {formattedValue && <Text style={styles.value}>{formattedValue}</Text>}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.container}>{content}</View>;
  }

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={1}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20, stiffness: 400 });
        }}
      >
        {content}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 16,
    backgroundColor: "transparent",
  },
  iconWrapper: {
    position: "relative",
    marginRight: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  chainBadgePosition: {
    position: "absolute",
    bottom: -2,
    right: -4,
  },
  nativeIcon: {
    backgroundColor: "#569F8C",
  },
  iconText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  info: {
    flex: 1,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  balance: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  valueContainer: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
  },
  value: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
});
