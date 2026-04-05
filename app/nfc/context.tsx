import { ChainId, DEFAULT_NETWORKS } from "@/app/profiles/client";
import { TransactionService } from "@/services/wallet";
import { useAccentColor } from "@/store/appearance";
import { SOLANA_CHAIN_KEYS, useWalletStore } from "@/store/wallet";
import { router } from "expo-router";
import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { Alert, Modal, StyleSheet, Text, View } from "react-native";
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    ZoomIn,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

/**
 * Parsed NFC payment data from terminal
 * Expected payload format: {"chainId": 88882, "address": "0x...", "network": "ethereum"}
 * Zap Pay HCE format adds: {"type": "zap-pay", "amount": "1.5"} for direct wallet payments
 */
export interface NfcPaymentData {
  chainId: number; // Chain ID from payload
  address: string; // Contract address (contract) or wallet address (zap-pay)
  network: string; // Network type ("ethereum" or "solana")
  raw: string; // Raw JSON string
  /** "zap-pay" = direct wallet tap-to-pay via HCE; "contract" = smart contract terminal;
   *  "receive-anything" = receiver accepts any token, will swap to settlement token */
  type: "zap-pay" | "contract" | "receive-anything";
  /** Requested amount for zap-pay / receive-anything tags */
  amount?: string;
  /** Optional token address for zap-pay token requests */
  tokenAddress?: string;
  /** Optional token symbol for UI/debug */
  tokenSymbol?: string;
  /** Settlement token address for receive-anything (what the receiver wants to end up with) */
  settleTokenAddress?: string;
  /** Settlement token symbol */
  settleTokenSymbol?: string;
  /** Settlement token decimals */
  settleTokenDecimals?: number;
}

interface NfcContextType {
  isSupported: boolean;
  isEnabled: boolean;
  isListening: boolean;
  isLocked: boolean;
  isOnPayScreen: boolean;
  setIsOnPayScreen: (value: boolean) => void;
  startListening: () => void;
  stopListening: () => void;
  toggleLock: () => void;
  lastTag: any | null;
  lastPayment: NfcPaymentData | null;
  clearLastPayment: () => void;
}

export const NfcContext = createContext<NfcContextType>({
  isSupported: false,
  isEnabled: false,
  isListening: false,
  isLocked: false,
  isOnPayScreen: false,
  setIsOnPayScreen: () => {},
  startListening: () => {},
  stopListening: () => {},
  toggleLock: () => {},
  lastTag: null,
  lastPayment: null,
  clearLastPayment: () => {},
});

export const useNfc = () => useContext(NfcContext);

/**
 * Check if a chain ID is known/supported
 */
export const isKnownChainId = (chainId: number): boolean => {
  const isEvm = chainId in DEFAULT_NETWORKS;
  const isSolana = Object.values(SOLANA_CHAIN_KEYS).includes(chainId as ChainId);
  return isEvm || isSolana;
};

/**
 * Get chain name from chain ID
 */
export const getChainName = (chainId: number): string => {
  if (chainId === SOLANA_CHAIN_KEYS["dynamic-mainnet"]) return "Solana";
  if (chainId === SOLANA_CHAIN_KEYS["dynamic-testnet"]) return "Solana Devnet";
  const network = DEFAULT_NETWORKS[chainId as ChainId];
  return network?.name || `Unknown Chain (${chainId})`;
};

export const NfcProvider = ({ children }: { children: React.ReactNode }) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isOnPayScreen, setIsOnPayScreen] = useState(false);
  const [lastTag, setLastTag] = useState<any | null>(null);
  const [lastPayment, setLastPayment] = useState<NfcPaymentData | null>(null);
  const listeningRef = useRef(false);
  const lastTagIdRef = useRef<string | null>(null);
  const isOnPayScreenRef = useRef(false);

  const accentColor = useAccentColor();

  // Access wallet state for auto-pay
  const accounts = useWalletStore((s) => s.accounts);
  const selectedAccountIndex = useWalletStore((s) => s.selectedAccountIndex);
  const selectedAccount = accounts[selectedAccountIndex] ?? null;

  // Auto-pay overlay state
  type AutoPayOverlay = "hidden" | "sending" | "success" | "error";
  const [autoPayOverlay, setAutoPayOverlay] = useState<AutoPayOverlay>("hidden");
  const [autoPayMeta, setAutoPayMeta] = useState<{ amount: string; symbol: string } | null>(null);

  // Ring pulse animation for the sending state
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (autoPayOverlay === "sending") {
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 700, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
      ringOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 700 }),
          withTiming(0.6, { duration: 0 }),
        ),
        -1,
      );
    } else {
      ringScale.value = withTiming(1, { duration: 200 });
      ringOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [autoPayOverlay]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  // Keep ref in sync with state
  useEffect(() => {
    isOnPayScreenRef.current = isOnPayScreen;
  }, [isOnPayScreen]);

  // Initialize NFC on mount
  useEffect(() => {
    const initNfc = async () => {
      try {
        const supported = await NfcManager.isSupported();
        setIsSupported(supported);
        console.log("[NFC] Supported:", supported);

        if (supported) {
          await NfcManager.start();
          console.log("[NFC] Manager started");

          const enabled = await NfcManager.isEnabled();
          setIsEnabled(enabled);
          console.log("[NFC] Enabled:", enabled);

          // Auto-start listening
          if (enabled) {
            startListeningLoop();
          }
        }
      } catch (error) {
        console.error("[NFC] Init error:", error);
      }
    };

    initNfc();

    return () => {
      listeningRef.current = false;
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  /**
   * Extract text content from NFC tag
   */
  const extractTextFromTag = (tag: any): string | null => {
    if (!tag.ndefMessage || tag.ndefMessage.length === 0) {
      return null;
    }

    for (const record of tag.ndefMessage) {
      if (record.tnf === Ndef.TNF_WELL_KNOWN) {
        try {
          const payload = record.payload;
          if (payload && payload.length > 0) {
            // Text record (type "T")
            if (record.type && String.fromCharCode(...record.type) === "T") {
              const langCodeLength = payload[0] & 0x3f;
              const text = String.fromCharCode(
                ...payload.slice(1 + langCodeLength),
              );
              return text;
            }
          }
        } catch (e) {
          console.log("[NFC] Could not decode record:", e);
        }
      }
    }
    return null;
  };

  /**
   * Parse JSON payment data from NFC tag text
   * Expected format: {"chainId": 88882, "address": "0x...", "network": "ethereum"}
   */
  const parsePaymentData = (text: string): NfcPaymentData | null => {
    try {
      const data = JSON.parse(text);

      // Validate required fields
      if (data.chainId === undefined || !data.address || !data.network) {
        console.log("[NFC] Missing required fields in JSON:", data);
        return null;
      }

      // Support EVM and Solana payloads
      if (data.network !== "ethereum" && data.network !== "solana") {
        console.log("[NFC] Unsupported network type:", data.network);
        return null;
      }

      // Validate chainId is a number
      const chainId = Number(data.chainId);
      if (isNaN(chainId)) {
        console.log("[NFC] Invalid chainId:", data.chainId);
        return null;
      }

      // Validate address format by network
      if (data.network === "ethereum") {
        if (!data.address.startsWith("0x") || data.address.length !== 42) {
          console.log("[NFC] Invalid EVM address format:", data.address);
          return null;
        }
      } else {
        const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(data.address));
        if (!isSolanaAddress) {
          console.log("[NFC] Invalid Solana address format:", data.address);
          return null;
        }
      }

      const knownTypes = ["zap-pay", "receive-anything", "contract"] as const;
      const parsedType = knownTypes.includes(data.type) ? data.type : "contract";

      const paymentData: NfcPaymentData = {
        chainId,
        address: data.address,
        network: data.network,
        raw: text,
        type: parsedType,
        amount: data.amount ? String(data.amount) : undefined,
        tokenAddress: data.tokenAddress ? String(data.tokenAddress) : undefined,
        tokenSymbol: data.tokenSymbol ? String(data.tokenSymbol) : undefined,
        settleTokenAddress: data.settleTokenAddress ? String(data.settleTokenAddress) : undefined,
        settleTokenSymbol: data.settleTokenSymbol ? String(data.settleTokenSymbol) : undefined,
        settleTokenDecimals: data.settleTokenDecimals != null ? Number(data.settleTokenDecimals) : undefined,
      };

      console.log("[NFC] ===== PAYMENT DATA =====");
      console.log("[NFC] Chain ID:", paymentData.chainId);
      console.log("[NFC] Chain Name:", getChainName(paymentData.chainId));
      console.log("[NFC] Known Chain:", isKnownChainId(paymentData.chainId));
      console.log("[NFC] Address:", paymentData.address);
      console.log("[NFC] Network:", paymentData.network);
      console.log("[NFC] ===========================");

      return paymentData;
    } catch (e) {
      console.log("[NFC] Failed to parse JSON:", e);
      return null;
    }
  };

  /**
   * Navigate to pay screen with payment data.
   * "zap-pay" tags route to the transfer screen (direct wallet payment),
   * while "contract" tags route to the NFC scan screen (smart contract flow).
   *
   * If the account has auto-pay enabled and the amount is within the limit,
   * the transaction is fired immediately without any screen navigation.
   */
  const navigateToPayScreen = async (payment: NfcPaymentData) => {
    console.log("[NFC] Navigating to pay screen, type:", payment.type);
    setLastPayment(payment);

    // -----------------------------------------------------------------------
    // Chain / wallet switching — ensure the sender is on the right network
    // -----------------------------------------------------------------------
    const store = useWalletStore.getState();
    const isSolanaRequest = payment.network === "solana" ||
      Object.values(SOLANA_CHAIN_KEYS).includes(payment.chainId as ChainId);
    const currentIsSVM = selectedAccount?.accountType === "solana" || selectedAccount?.accountType === "dynamic";

    if (isSolanaRequest !== currentIsSVM) {
      // Need to switch wallet type (EVM↔SVM)
      const matchingAccountIdx = isSolanaRequest
        ? store.accounts.findIndex((a) => a.accountType === "solana" || a.accountType === "dynamic")
        : store.accounts.findIndex((a) => (a.accountType ?? "evm") === "evm");
      if (matchingAccountIdx >= 0) {
        console.log(`[NFC] Switching to ${isSolanaRequest ? "SVM" : "EVM"} wallet (index ${matchingAccountIdx})`);
        store.setSelectedAccountIndex(matchingAccountIdx);
      } else {
        Alert.alert(
          "No wallet found",
          `This payment requires a ${isSolanaRequest ? "Solana" : "EVM"} wallet. Create one in Settings.`,
        );
        return;
      }
    }

    // For EVM requests, switch to the correct chain if different
    if (!isSolanaRequest && payment.chainId !== store.selectedChainId) {
      const knownEvm = payment.chainId in DEFAULT_NETWORKS;
      if (knownEvm) {
        console.log("[NFC] Switching EVM chain:", store.selectedChainId, "→", payment.chainId);
        store.setSelectedChainId(payment.chainId as ChainId);
      }
    }

    // Re-read selected account after potential switch
    const activeAccount = store.accounts[store.selectedAccountIndex] ?? selectedAccount;

    // -----------------------------------------------------------------------
    // Auto-pay (native currency only, within limit)
    // -----------------------------------------------------------------------
    if (payment.type === "zap-pay" && payment.amount && activeAccount) {
      const autoPayLimit = activeAccount.autoPayLimit;
      const amountNum = parseFloat(payment.amount);
      const limitNum = autoPayLimit ? parseFloat(autoPayLimit) : null;

      if (limitNum !== null && !isNaN(amountNum) && !isNaN(limitNum) && amountNum <= limitNum) {
        console.log("[NFC] Auto-pay firing instantly:", amountNum, "<=", limitNum);
        const symbol = DEFAULT_NETWORKS[payment.chainId as ChainId]?.nativeCurrency.symbol ?? "ETH";
        setAutoPayMeta({ amount: payment.amount, symbol });
        setAutoPayOverlay("sending");
        try {
          const result = await TransactionService.sendNative(
            activeAccount.address,
            payment.address,
            payment.amount,
            payment.chainId as ChainId,
          );
          if ("error" in result) {
            console.error("[NFC] Auto-pay failed:", result.error);
            setAutoPayOverlay("error");
            setTimeout(() => setAutoPayOverlay("hidden"), 3000);
          } else {
            console.log("[NFC] Auto-pay success:", result.hash);
            setAutoPayOverlay("success");
            setTimeout(() => {
              setAutoPayOverlay("hidden");
              router.push("/(tabs)");
            }, 2000);
          }
        } catch (err: any) {
          console.error("[NFC] Auto-pay error:", err);
          setAutoPayOverlay("error");
          setTimeout(() => setAutoPayOverlay("hidden"), 3000);
        }
        return;
      }
    }

    if (payment.type === "zap-pay") {
      // No auto-pay — show transfer screen for manual confirmation
      router.push({
        pathname: "/send/transfer",
        params: {
          address: payment.address,
          chainId: payment.chainId.toString(),
          ...(payment.amount ? { amount: payment.amount } : {}),
          ...(payment.tokenAddress ? { tokenAddress: payment.tokenAddress } : {}),
        },
      } as any);
    } else if (payment.type === "receive-anything") {
      // Receiver accepts any token — show send-anything screen
      router.push({
        pathname: "/send/send-anything",
        params: {
          address: payment.address,
          chainId: payment.chainId.toString(),
          amount: payment.amount ?? "",
          settleTokenAddress: payment.settleTokenAddress ?? "",
          settleTokenSymbol: payment.settleTokenSymbol ?? "",
          settleTokenDecimals: (payment.settleTokenDecimals ?? 18).toString(),
        },
      } as any);
    } else {
      // Smart contract terminal — scan screen handles the rest
      router.push("/nfc/scan");
    }
  };

  /**
   * Show alert when unknown chain is detected
   */
  const showUnknownChainAlert = (chainId: number) => {
    Alert.alert(
      "Unknown Chain",
      `Chain ID ${chainId} is not configured in your wallet. Please add this chain to continue.`,
      [{ text: "OK" }],
    );
  };

  // Parse and process NFC tag data
  const parseNfcTag = (tag: any) => {
    console.log("[NFC] ===== TAG DATA =====");
    console.log("[NFC] Tag ID:", tag.id);
    console.log("[NFC] Tech Types:", tag.techTypes);
    console.log("[NFC] Is on pay screen:", isOnPayScreenRef.current);

    // Extract text content
    const text = extractTextFromTag(tag);
    if (text) {
      console.log("[NFC] Text content:", text);

      // Try to parse as payment data
      const payment = parsePaymentData(text);
      if (payment) {
        // Check if chain is known
        if (!isKnownChainId(payment.chainId)) {
          showUnknownChainAlert(payment.chainId);
          return;
        }

        // If we're on the pay screen, just set the payment data
        // The scan screen will handle the rest
        if (isOnPayScreenRef.current) {
          setLastPayment(payment);
        } else {
          // Navigate to pay screen with the payment data
          navigateToPayScreen(payment);
        }
      }
    } else {
      console.log("[NFC] No text content found");
    }

    console.log("[NFC] ====================");
  };

  // Polling loop for NFC tags
  const startListeningLoop = async () => {
    if (listeningRef.current) return;

    listeningRef.current = true;
    setIsListening(true);
    console.log("[NFC] Starting listening loop...");

    while (listeningRef.current) {
      try {
        // Request NDEF technology - this will wait for a tag
        await NfcManager.requestTechnology(NfcTech.Ndef, {
          alertMessage: "Hold your device near an NFC terminal",
        });

        // Get the tag
        const tag = await NfcManager.getTag();

        if (tag) {
          // Check if it's a new tag (not the same one we just read)
          const tagId = tag.id || JSON.stringify(tag);
          if (tagId !== lastTagIdRef.current) {
            lastTagIdRef.current = tagId;
            console.log("[NFC] New tag detected!");
            console.log("[NFC] Raw tag:", JSON.stringify(tag, null, 2));
            setLastTag(tag);
            parseNfcTag(tag);
          }
        }

        // Clean up before next iteration
        await NfcManager.cancelTechnologyRequest();

        // Small delay before next scan to prevent CPU overload
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Reset last tag after a delay so we can read same tag again
        setTimeout(() => {
          lastTagIdRef.current = null;
        }, 2000);
      } catch (error: any) {
        // Cancelled or other error - just continue
        if (error.message !== "cancelled" && listeningRef.current) {
          console.log("[NFC] Loop iteration error:", error.message);
        }
        // Clean up and retry
        await NfcManager.cancelTechnologyRequest().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    setIsListening(false);
    console.log("[NFC] Listening loop stopped");
  };

  const startListening = () => {
    if (!isSupported || !isEnabled) {
      console.log("[NFC] Cannot start - not supported or enabled");
      return;
    }
    startListeningLoop();
  };

  const stopListening = () => {
    listeningRef.current = false;
    NfcManager.cancelTechnologyRequest().catch(() => {});
    setIsListening(false);
    console.log("[NFC] Stopping listening...");
  };

  const clearLastPayment = () => {
    setLastPayment(null);
  };

  const toggleLock = () => {
    if (isLocked) {
      // Unlock - start listening again
      console.log("[NFC] Unlocking - resuming listening");
      setIsLocked(false);
      startListeningLoop();
    } else {
      // Lock - stop listening
      console.log("[NFC] Locking - stopping listening");
      setIsLocked(true);
      listeningRef.current = false;
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setIsListening(false);
    }
  };

  return (
    <NfcContext.Provider
      value={{
        isSupported,
        isEnabled,
        isListening,
        isLocked,
        isOnPayScreen,
        setIsOnPayScreen,
        startListening,
        stopListening,
        toggleLock,
        lastTag,
        lastPayment,
        clearLastPayment,
      }}
    >
      {children}

      {/* Auto-pay full-screen overlay */}
      <Modal visible={autoPayOverlay !== "hidden"} transparent animationType="none">
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(300)} style={overlayStyles.backdrop}>

          {autoPayOverlay === "sending" && (
            <Animated.View entering={ZoomIn.duration(250)} style={overlayStyles.card}>
              {/* Pulsing ring behind icon */}
              <View style={overlayStyles.iconWrap}>
                <Animated.View style={[overlayStyles.ring, { borderColor: accentColor }, ringStyle]} />
                <View style={[overlayStyles.iconCircle, { borderColor: accentColor }]}>
                  <Text style={overlayStyles.lightning}>⚡</Text>
                </View>
              </View>
              <Text style={overlayStyles.title}>Paying</Text>
              <Text style={overlayStyles.amount}>
                {autoPayMeta?.amount} {autoPayMeta?.symbol}
              </Text>
              <Text style={overlayStyles.hint}>Auto-pay sending…</Text>
            </Animated.View>
          )}

          {autoPayOverlay === "success" && (
            <Animated.View entering={ZoomIn.duration(300)} style={overlayStyles.card}>
              <View style={[overlayStyles.iconCircle, overlayStyles.iconSuccess]}>
                <Text style={overlayStyles.lightning}>✓</Text>
              </View>
              <Text style={[overlayStyles.title, overlayStyles.titleSuccess]}>Sent!</Text>
              <Text style={overlayStyles.amount}>
                {autoPayMeta?.amount} {autoPayMeta?.symbol}
              </Text>
            </Animated.View>
          )}

          {autoPayOverlay === "error" && (
            <Animated.View entering={ZoomIn.duration(300)} style={overlayStyles.card}>
              <View style={[overlayStyles.iconCircle, overlayStyles.iconError]}>
                <Text style={overlayStyles.lightning}>✕</Text>
              </View>
              <Text style={[overlayStyles.title, overlayStyles.titleError]}>Failed</Text>
              <Text style={overlayStyles.hint}>Auto-pay could not complete</Text>
            </Animated.View>
          )}

        </Animated.View>
      </Modal>
    </NfcContext.Provider>
  );
};

const overlayStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 48,
  },
  iconWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "#569F8C",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1E2E29",
    borderWidth: 2,
    borderColor: "#569F8C",
    alignItems: "center",
    justifyContent: "center",
  },
  iconSuccess: {
    borderColor: "#10B981",
    backgroundColor: "#10B98120",
  },
  iconError: {
    borderColor: "#EF4444",
    backgroundColor: "#EF444420",
  },
  lightning: {
    fontSize: 36,
    color: "#FFFFFF",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  titleSuccess: {
    color: "#10B981",
  },
  titleError: {
    color: "#EF4444",
  },
  amount: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "600",
  },
  hint: {
    color: "#9CA3AF",
    fontSize: 15,
  },
});
