/**
 * Merchant Checkout Screen
 * Broadcasts the basket total via HCE so a customer can tap to pay.
 * Same underlying HCE logic as Zap Pay receive, different UI (shows basket).
 */

import { getChainName, useNfc } from "@/app/nfc/context";
import { EthersClient } from "@/app/profiles/client";
import { useFiatValue } from "@/hooks/use-fiat-value";
import { hexToRgba, tintedBackground, useAccentColor } from "@/store/appearance";
import { useMerchantStore } from "@/store/merchant";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    Vibration,
    View,
} from "react-native";
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

// HCE is Android-only
let HCESession: any = null;
let NFCTagType4: any = null;
let NFCTagType4NDEFContentType: any = null;
try {
  if (Platform.OS === "android") {
    const hce = require("react-native-hce");
    HCESession = hce.HCESession;
    NFCTagType4 = hce.NFCTagType4;
    NFCTagType4NDEFContentType = hce.NFCTagType4NDEFContentType;
    console.log("[MerchantCheckout] react-native-hce loaded OK");
  }
} catch (e) {
  console.warn("[MerchantCheckout] react-native-hce not available:", e);
}

type BroadcastStatus = "idle" | "broadcasting" | "tapped" | "confirmed" | "error";

export default function MerchantCheckoutScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);
  const symbol = networkConfig?.nativeCurrency.symbol ?? "ETH";

  const products = useMerchantStore((s) => s.products);
  const basket = useMerchantStore((s) => s.basket);
  const getBasketTotal = useMerchantStore((s) => s.getBasketTotal);
  const clearBasket = useMerchantStore((s) => s.clearBasket);

  const { stopListening, startListening } = useNfc();

  const [status, setStatus] = useState<BroadcastStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const accentSurface = hexToRgba(accentColor, 0.16);
  const accentBorder = hexToRgba(accentColor, 0.38);

  const total = getBasketTotal();
  const fiatTotal = useFiatValue(total, selectedChainId);

  const sessionRef = useRef<any>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  // Animated rings
  const ring1Scale = useSharedValue(1);
  const ring2Scale = useSharedValue(1);
  const ring3Scale = useSharedValue(1);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: 2 - ring1Scale.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: 2 - ring2Scale.value,
  }));
  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring3Scale.value }],
    opacity: 2 - ring3Scale.value,
  }));

  useEffect(() => {
    if (status === "broadcasting" || status === "tapped") {
      ring1Scale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
      ring2Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(1.6, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
      ring3Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(1.6, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
    } else {
      ring1Scale.value = withTiming(1, { duration: 300 });
      ring2Scale.value = withTiming(1, { duration: 300 });
      ring3Scale.value = withTiming(1, { duration: 300 });
    }
  }, [status]);

  // Disable NFC reading while broadcasting — HCE and reader fight over the hardware
  useFocusEffect(
    useCallback(() => {
      console.log("[MerchantCheckout] Screen focused — stopping NFC reader");
      stopListening();
      return () => {
        console.log("[MerchantCheckout] Screen unfocused — resuming NFC reader");
        startListening();
      };
    }, []),
  );

  // Cleanup HCE on unmount
  useEffect(() => {
    return () => {
      stopBroadcasting();
    };
  }, []);

  const stopBroadcasting = async () => {
    console.log("[MerchantCheckout] stopBroadcasting called");
    try {
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;
      if (sessionRef.current) {
        await sessionRef.current.setEnabled(false);
        console.log("[MerchantCheckout] HCE session disabled");
      }
      sessionRef.current = null;
    } catch (e) {
      console.warn("[MerchantCheckout] Error stopping HCE session:", e);
    }
  };

  const startBroadcasting = async () => {
    if (!selectedAccount) return;

    if (Platform.OS !== "android") {
      setErrorMessage("NFC broadcasting is only supported on Android.");
      setStatus("error");
      return;
    }

    if (!HCESession || !NFCTagType4 || !NFCTagType4NDEFContentType) {
      const msg = "react-native-hce native module not found. Run: expo prebuild && expo run:android";
      console.error("[MerchantCheckout]", msg);
      setErrorMessage(msg);
      setStatus("error");
      return;
    }

    try {
      const payload = JSON.stringify({
        chainId: selectedChainId,
        address: selectedAccount.address,
        network: "ethereum",
        type: "zap-pay",
        amount: total,
      });

      console.log("[MerchantCheckout] Starting HCE — total:", total, symbol);
      console.log("[MerchantCheckout] Payload:", payload);

      const tag = new NFCTagType4({
        type: NFCTagType4NDEFContentType.Text,
        content: payload,
        writable: true,
      });

      const session = await HCESession.getInstance();
      sessionRef.current = session;
      await session.setApplication(tag);

      const cleanupRead = session.on(HCESession.Events.HCE_STATE_READ, () => {
        console.log("[MerchantCheckout] HCE_STATE_READ — customer tapped");
        setTapCount((c) => c + 1);
        setStatus("tapped");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate(50);
        setTimeout(() => setStatus("broadcasting"), 2000);
      });

      const cleanupWrite = session.on(HCESession.Events.HCE_STATE_WRITE, () => {
        const written = sessionRef.current?.application?.content;
        console.log("[MerchantCheckout] HCE_STATE_WRITE — customer wrote back:", written);
        setStatus("confirmed");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate([0, 50, 50, 50]);
      });

      cleanupListenersRef.current = () => {
        cleanupRead();
        cleanupWrite();
      };

      await session.setEnabled(true);
      console.log("[MerchantCheckout] HCE ENABLED — broadcasting");
      setStatus("broadcasting");
      setErrorMessage(null);
    } catch (err: any) {
      console.error("[MerchantCheckout] Failed to start HCE:", err);
      setErrorMessage(err?.message ?? "Failed to start NFC broadcasting.");
      setStatus("error");
    }
  };

  const handleStop = async () => {
    await stopBroadcasting();
    setStatus("idle");
    setTapCount(0);
  };

  const handleNewSale = async () => {
    await stopBroadcasting();
    clearBasket();
    router.back();
  };

  const isBroadcasting = status === "broadcasting" || status === "tapped" || status === "confirmed";

  const getStatusColor = () => {
    switch (status) {
      case "broadcasting": return accentColor;
      case "tapped": return accentColor;
      case "confirmed": return accentColor;
      case "error": return "#EF4444";
      default: return "#6B7280";
    }
  };

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "broadcasting": return "radio-outline";
      case "tapped": return "phone-portrait-outline";
      case "confirmed": return "checkmark-circle-outline";
      case "error": return "alert-circle-outline";
      default: return "radio-outline";
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case "broadcasting": return "Awaiting payment";
      case "tapped": return "Customer tapped!";
      case "confirmed": return "Payment received!";
      case "error": return "Error";
      default: return "Ready to charge";
    }
  };

  const getStatusSubtext = () => {
    switch (status) {
      case "broadcasting": return "Ask the customer to tap their phone";
      case "tapped": return "Customer read the payment tag";
      case "confirmed": return "Transaction confirmed by customer device";
      case "error": return errorMessage ?? "Something went wrong";
      default: return "Tap 'Charge Customer' to start NFC broadcast";
    }
  };

  if (!selectedAccount) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} disabled={isBroadcasting}>
          <Ionicons name="arrow-back" size={24} color={isBroadcasting ? "#374151" : "#FFFFFF"} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Total amount */}
        <Animated.View entering={FadeIn.delay(50)} style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total to charge</Text>
          <Text style={styles.totalAmount}>{total}</Text>
          <Text style={[styles.totalSymbol, { color: accentColor }]}>{symbol}</Text>
          {fiatTotal && <Text style={styles.totalFiat}>≈ {fiatTotal}</Text>}
          <Text style={styles.totalNetwork}>
            on {networkConfig?.name ?? getChainName(selectedChainId)}
          </Text>
        </Animated.View>

        {/* Broadcast indicator */}
        <View style={styles.scannerContainer}>
          {(status === "broadcasting" || status === "tapped") && (
            <>
              <Animated.View style={[styles.ring, { borderColor: getStatusColor() }, ring1Style]} />
              <Animated.View style={[styles.ring, { borderColor: getStatusColor() }, ring2Style]} />
              <Animated.View style={[styles.ring, { borderColor: getStatusColor() }, ring3Style]} />
            </>
          )}
          <Animated.View
            entering={FadeIn.duration(300)}
            style={[styles.iconContainer, { borderColor: getStatusColor() }]}
          >
            <Ionicons name={getStatusIcon()} size={64} color={getStatusColor()} />
          </Animated.View>
        </View>

        {/* Status */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.statusArea}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusMessage()}
          </Text>
          <Text style={styles.statusSubtext}>{getStatusSubtext()}</Text>
          {tapCount > 0 && status !== "confirmed" && (
            <View style={[styles.tapBadge, { backgroundColor: accentColor + "20" }]}>
              <Ionicons name="radio" size={13} color={accentColor} />
              <Text style={[styles.tapBadgeText, { color: accentColor }]}>{tapCount} tap{tapCount !== 1 ? "s" : ""}</Text>
            </View>
          )}
        </Animated.View>

        {/* Basket summary */}
        <Animated.View entering={FadeInDown.delay(150)} style={styles.basketCard}>
          <Text style={styles.basketCardTitle}>Order Summary</Text>
          {basket.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            if (!product) return null;
            const lineTotal = parseFloat((parseFloat(product.price) * item.quantity).toFixed(8)).toString();
            return (
              <View key={item.productId} style={styles.basketRow}>
                <Text style={styles.basketRowEmoji}>{product.emoji}</Text>
                <Text style={styles.basketRowName} numberOfLines={1}>
                  {product.name}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                </Text>
                <Text style={styles.basketRowTotal}>{lineTotal} {symbol}</Text>
              </View>
            );
          })}
          <View style={styles.basketDivider} />
          <View style={styles.basketRow}>
            <Text style={[styles.basketRowName, { color: "#FFFFFF", fontWeight: "700" }]}>Total</Text>
            <Text style={[styles.basketRowTotal, { color: accentColor, fontWeight: "700" }]}>
              {total} {symbol}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Action buttons */}
      <Animated.View entering={FadeInDown.delay(200)} style={styles.footer}>
        {status === "confirmed" ? (
          <TouchableOpacity
            style={[styles.newSaleBtn, { backgroundColor: accentSurface, borderColor: accentColor }]}
            onPress={handleNewSale}
          >
            <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
            <Text style={[styles.newSaleBtnText, { color: accentColor }]}>New Sale</Text>
          </TouchableOpacity>
        ) : !isBroadcasting ? (
          <TouchableOpacity
            style={[
              styles.chargeBtn,
              { backgroundColor: accentColor },
              Platform.OS !== "android" && styles.chargeBtnDisabled,
            ]}
            onPress={startBroadcasting}
            disabled={Platform.OS !== "android"}
          >
            <Ionicons name="radio" size={20} color="#FFFFFF" />
            <Text style={styles.chargeBtnText}>Charge Customer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.stopBtn, { backgroundColor: accentSurface, borderColor: accentBorder }]}
            onPress={handleStop}
          >
            <Ionicons name="stop-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.stopBtnText}>Stop Broadcasting</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1512" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#6B7280", fontSize: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  scroll: { paddingBottom: 16 },
  totalCard: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "#1E2E29",
    borderRadius: 20,
    gap: 2,
  },
  totalLabel: { color: "#9CA3AF", fontSize: 13, fontWeight: "500", textTransform: "uppercase", letterSpacing: 1 },
  totalAmount: { color: "#FFFFFF", fontSize: 48, fontWeight: "800", lineHeight: 58, marginTop: 4 },
  totalSymbol: { color: "#569F8C", fontSize: 20, fontWeight: "700" },
  totalFiat: { color: "#9CA3AF", fontSize: 16, marginTop: 4 },
  totalNetwork: { color: "#4B5563", fontSize: 13, marginTop: 4 },
  scannerContainer: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 28,
    marginBottom: 24,
  },
  ring: {
    position: "absolute",
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 2,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  statusArea: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  statusText: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  statusSubtext: { fontSize: 14, color: "#9CA3AF", textAlign: "center", lineHeight: 20 },
  tapBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#569F8C20",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 4,
  },
  tapBadgeText: { color: "#569F8C", fontSize: 12, fontWeight: "600" },
  basketCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  basketCardTitle: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  basketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  basketRowEmoji: { fontSize: 18, width: 26 },
  basketRowName: { flex: 1, color: "#D1D5DB", fontSize: 14 },
  basketRowTotal: { color: "#9CA3AF", fontSize: 14 },
  basketDivider: { height: 1, backgroundColor: "#374151", marginVertical: 4 },
  footer: { padding: 20, paddingTop: 8 },
  chargeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  chargeBtnDisabled: { opacity: 0.5 },
  chargeBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#374151",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  stopBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  newSaleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E2E29",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  newSaleBtnText: { color: "#10B981", fontSize: 17, fontWeight: "700" },
});
