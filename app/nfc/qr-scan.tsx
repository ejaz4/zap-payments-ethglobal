/**
 * QR Scan Screen
 * Scan QR code instead of NFC for payment
 */

import { Ionicons } from "@expo/vector-icons";
import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { getChainName } from "@/app/nfc/context";
import { ChainId } from "@/app/profiles/client";
import { useWalletStore } from "@/store/wallet";

interface QRPayload {
  chainId: string;
  address: string;
  network: string;
}

export default function QRScanScreen() {
  const router = useRouter();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const setSelectedChainId = useWalletStore((s) => s.setSelectedChainId);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showChainMismatch, setShowChainMismatch] = useState(false);
  const [mismatchPayload, setMismatchPayload] = useState<QRPayload | null>(
    null,
  );

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    if (scanned) return;

    const { data } = result;

    try {
      // Parse the QR code data
      const payload: QRPayload = JSON.parse(data);

      if (!payload.chainId || !payload.address) {
        Alert.alert(
          "Invalid QR Code",
          "This QR code doesn't contain valid payment information.",
        );
        return;
      }

      setScanned(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const payloadChainId = parseInt(payload.chainId, 10);

      // Check if user is on the correct chain
      if (payloadChainId !== selectedChainId) {
        // Wrong chain - show mismatch dialog
        setMismatchPayload(payload);
        setShowChainMismatch(true);
      } else {
        // Correct chain - navigate to payment screen
        navigateToPayment(payload);
      }
    } catch (err) {
      console.error("[QRScan] Failed to parse QR code:", err);
      Alert.alert(
        "Invalid QR Code",
        "Could not read the QR code. Please try again.",
      );
    }
  };

  const navigateToPayment = (payload: QRPayload) => {
    router.push({
      pathname: "/nfc/payment",
      params: {
        address: payload.address,
        chainId: payload.chainId,
      },
    });
  };

  const handleSwitchChain = () => {
    if (!mismatchPayload) return;

    const newChainId = parseInt(mismatchPayload.chainId, 10) as ChainId;
    setSelectedChainId(newChainId);
    setShowChainMismatch(false);
    navigateToPayment(mismatchPayload);
    setMismatchPayload(null);
  };

  const handleCancelMismatch = () => {
    setShowChainMismatch(false);
    setMismatchPayload(null);
    setScanned(false);
  };

  const handleClose = () => {
    router.back();
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.statusText}>Requesting camera permission...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR Code</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={64} color="#6B7280" />
          <Text style={styles.statusText}>Camera access needed</Text>
          <Text style={styles.hintText}>
            Please enable camera access to scan QR codes for payments.
          </Text>
          <TouchableOpacity
            style={styles.enableButton}
            onPress={requestPermission}
          >
            <Text style={styles.enableButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Current Chain Badge */}
      <View style={styles.chainBadge}>
        <View style={styles.chainDot} />
        <Text style={styles.chainText}>
          Connected to {getChainName(selectedChainId)}
        </Text>
      </View>

      {/* Scanner */}
      <View style={styles.scannerWrapper}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />

        {/* Scanner Overlay */}
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>
      </View>

      {/* Instructions */}
      <Animated.View
        entering={SlideInDown.delay(200)}
        style={styles.instructions}
      >
        <Text style={styles.instructionText}>
          Point your camera at a payment QR code
        </Text>
        {scanned && !showChainMismatch && (
          <TouchableOpacity
            style={styles.rescanButton}
            onPress={() => setScanned(false)}
          >
            <Text style={styles.rescanButtonText}>Tap to Scan Again</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

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
          <Animated.View entering={FadeIn} style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning" size={48} color="#F59E0B" />
            </View>

            <Text style={styles.modalTitle}>Wrong Network</Text>

            <Text style={styles.modalMessage}>
              This QR code requires{" "}
              <Text style={styles.modalHighlight}>
                {mismatchPayload
                  ? getChainName(parseInt(mismatchPayload.chainId, 10))
                  : ""}
              </Text>
              , but you're currently on{" "}
              <Text style={styles.modalHighlight}>
                {getChainName(selectedChainId)}
              </Text>
              .
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={handleCancelMismatch}
              >
                <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalPrimaryButton}
                onPress={handleSwitchChain}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  Switch Network
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
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
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
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
  scannerWrapper: {
    flex: 1,
    margin: 24,
    borderRadius: 16,
    overflow: "hidden",
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  scannerFrame: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#569F8C",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  instructions: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  instructionText: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
  },
  rescanButton: {
    backgroundColor: "#1E2E29",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rescanButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  cancelButton: {
    marginHorizontal: 24,
    marginBottom: 16,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#1E2E29",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#1E2E29",
    borderRadius: 20,
    padding: 24,
    width: "100%",
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
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 16,
    color: "#D1D5DB",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  modalHighlight: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalSecondaryButton: {
    flex: 1,
    backgroundColor: "#374151",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalSecondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalPrimaryButton: {
    flex: 1,
    backgroundColor: "#569F8C",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
