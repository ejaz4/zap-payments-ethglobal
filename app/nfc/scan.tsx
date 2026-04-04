/**
 * NFC Scan Screen
 * Dedicated screen for NFC tag scanning with visual feedback
 * Uses NfcProvider context for all NFC operations
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { NfcPaymentData, getChainName, useNfc } from "@/app/nfc/context";
import { ChainId } from "@/app/profiles/client";
import { useWalletStore } from "@/store/wallet";

export default function NfcScanScreen() {
  const router = useRouter();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const setSelectedChainId = useWalletStore((s) => s.setSelectedChainId);

  const {
    isSupported,
    isEnabled,
    isListening,
    startListening,
    setIsOnPayScreen,
    lastPayment,
    clearLastPayment,
  } = useNfc();

  const [showChainMismatch, setShowChainMismatch] = useState(false);
  const [mismatchPayment, setMismatchPayment] = useState<NfcPaymentData | null>(
    null,
  );

  // Mark that we're on the pay screen when mounted
  useEffect(() => {
    setIsOnPayScreen(true);
    return () => setIsOnPayScreen(false);
  }, [setIsOnPayScreen]);

  // Get status message
  const getStatusMessage = () => {
    if (!isSupported) return "NFC is not available on this device";
    if (!isEnabled) return "NFC is disabled. Please enable it in settings.";
    if (isListening) return "Ready! Tap your device on the NFC terminal";
    return "Initializing NFC...";
  };

  // Handle payment data when detected
  useEffect(() => {
    if (!lastPayment) return;

    console.log("[NfcScan] Payment detected:", lastPayment);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Check if user is on the correct chain
    if (lastPayment.chainId !== selectedChainId) {
      // Wrong chain - show mismatch dialog
      setMismatchPayment(lastPayment);
      setShowChainMismatch(true);
    } else {
      // Correct chain - navigate to payment screen
      navigateToPayment(lastPayment);
    }
  }, [lastPayment, selectedChainId]);

  const navigateToPayment = (payment: NfcPaymentData) => {
    clearLastPayment();
    router.push({
      pathname: "/nfc/payment",
      params: {
        address: payment.address,
        chainId: payment.chainId.toString(),
      },
    });
  };

  const handleSwitchChain = () => {
    if (!mismatchPayment) return;

    // Switch to the required chain
    setSelectedChainId(mismatchPayment.chainId as ChainId);
    setShowChainMismatch(false);

    // Navigate to payment
    navigateToPayment(mismatchPayment);
    setMismatchPayment(null);
  };

  const handleCancelMismatch = () => {
    setShowChainMismatch(false);
    setMismatchPayment(null);
    clearLastPayment();
  };

  // Animated rings
  const ring1Scale = useSharedValue(1);
  const ring2Scale = useSharedValue(1);
  const ring3Scale = useSharedValue(1);

  useEffect(() => {
    if (isListening) {
      ring1Scale.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
      ring2Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(1.5, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
      ring3Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(1.5, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
    }
  }, [isListening]);

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

  const handleClose = () => {
    router.back();
  };

  const handleRetry = () => {
    if (!isEnabled) {
      Alert.alert(
        "NFC Disabled",
        "Please enable NFC in your device settings to scan tags.",
        [{ text: "OK" }],
      );
    } else if (!isListening) {
      startListening();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Zap Pay</Text>
        <TouchableOpacity
          onPress={() => router.push("/nfc/qr-scan" as any)}
          style={styles.qrButton}
        >
          <Ionicons name="qr-code" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Current Chain Badge */}
      <View style={styles.chainBadge}>
        <View style={styles.chainDot} />
        <Text style={styles.chainText}>
          Connected to {getChainName(selectedChainId)}
        </Text>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Animated Rings */}
        <View style={styles.scannerContainer}>
          {isListening && (
            <>
              <Animated.View style={[styles.ring, ring1Style]} />
              <Animated.View style={[styles.ring, ring2Style]} />
              <Animated.View style={[styles.ring, ring3Style]} />
            </>
          )}

          {/* NFC Icon */}
          <Animated.View
            entering={FadeIn.duration(300)}
            style={styles.iconContainer}
          >
            <Ionicons
              name="radio-outline"
              size={80}
              color={
                isListening ? "#10B981" : !isEnabled ? "#F59E0B" : "#6B7280"
              }
            />
          </Animated.View>
        </View>

        {/* Status Message */}
        <Animated.View
          entering={SlideInDown.delay(200)}
          style={styles.messageContainer}
        >
          <Text style={styles.statusText}>{getStatusMessage()}</Text>

          {!isEnabled && isSupported && (
            <TouchableOpacity style={styles.enableButton} onPress={handleRetry}>
              <Text style={styles.enableButtonText}>Check NFC Settings</Text>
            </TouchableOpacity>
          )}

          {!isSupported && (
            <Text style={styles.hintText}>
              This device doesn't support NFC. You can still use QR codes to
              make payments.
            </Text>
          )}
        </Animated.View>
      </View>

      {/* Bottom Instructions */}
      <View style={styles.instructions}>
        <View style={styles.instructionRow}>
          <View style={styles.instructionIcon}>
            <Ionicons name="phone-portrait-outline" size={24} color="#569F8C" />
          </View>
          <Text style={styles.instructionText}>
            Hold the back of your phone near the NFC terminal
          </Text>
        </View>

        <View style={styles.instructionRow}>
          <View style={styles.instructionIcon}>
            <Ionicons name="hand-left-outline" size={24} color="#569F8C" />
          </View>
          <Text style={styles.instructionText}>
            Keep steady until the terminal is detected
          </Text>
        </View>
      </View>

      {/* Cancel Button */}
      <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>

      {/* Chain Mismatch Modal */}
      <Modal
        visible={showChainMismatch}
        transparent
        animationType="fade"
        onRequestClose={handleCancelMismatch}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning" size={48} color="#F59E0B" />
            </View>

            <Text style={styles.modalTitle}>Wrong Network</Text>

            <Text style={styles.modalMessage}>
              This terminal requires{" "}
              <Text style={styles.modalHighlight}>
                {mismatchPayment ? getChainName(mismatchPayment.chainId) : ""}
              </Text>
              , but you're currently on{" "}
              <Text style={styles.modalHighlight}>
                {getChainName(selectedChainId)}
              </Text>
              .
            </Text>

            <Text style={styles.modalSubtext}>
              Would you like to switch networks to continue?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={handleCancelMismatch}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={handleSwitchChain}
              >
                <Text style={styles.modalButtonPrimaryText}>
                  Switch Network
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  qrButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  chainBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#1E2E29",
    marginHorizontal: 24,
    borderRadius: 20,
    gap: 8,
  },
  chainDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  chainText: {
    fontSize: 14,
    color: "#D1D5DB",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  scannerContainer: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 48,
  },
  ring: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: "#10B981",
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#374151",
  },
  messageContainer: {
    alignItems: "center",
    gap: 16,
  },
  statusText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  },
  hintText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  enableButton: {
    backgroundColor: "#569F8C",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  enableButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  instructions: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
  },
  instructionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#569F8C20",
    alignItems: "center",
    justifyContent: "center",
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: "#D1D5DB",
    lineHeight: 20,
  },
  cancelButton: {
    marginHorizontal: 24,
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: "#374151",
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#1E2E29",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  modalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F59E0B20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 16,
    color: "#D1D5DB",
    textAlign: "center",
    lineHeight: 24,
  },
  modalHighlight: {
    color: "#569F8C",
    fontWeight: "600",
  },
  modalSubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 12,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    width: "100%",
  },
  modalButtonSecondary: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: "#374151",
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonSecondaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalButtonPrimary: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: "#569F8C",
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
