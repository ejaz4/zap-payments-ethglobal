import { ChainId, DEFAULT_NETWORKS } from "@/app/profiles/client";
import { router } from "expo-router";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";

/**
 * Parsed NFC payment data from terminal
 * Expected payload format: {"chainId": 88882, "address": "0x...", "network": "ethereum"}
 */
export interface NfcPaymentData {
  chainId: number; // Chain ID from payload
  address: string; // Contract/recipient address
  network: string; // Network type (always "ethereum" for EVM)
  raw: string; // Raw JSON string
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
  return chainId in DEFAULT_NETWORKS;
};

/**
 * Get chain name from chain ID
 */
export const getChainName = (chainId: number): string => {
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

      // Only support EVM networks
      if (data.network !== "ethereum") {
        console.log("[NFC] Unsupported network type:", data.network);
        return null;
      }

      // Validate chainId is a number
      const chainId = Number(data.chainId);
      if (isNaN(chainId)) {
        console.log("[NFC] Invalid chainId:", data.chainId);
        return null;
      }

      // Validate address format (basic hex check)
      if (!data.address.startsWith("0x") || data.address.length !== 42) {
        console.log("[NFC] Invalid address format:", data.address);
        return null;
      }

      const paymentData: NfcPaymentData = {
        chainId,
        address: data.address,
        network: data.network,
        raw: text,
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
   * Navigate to pay screen with payment data
   */
  const navigateToPayScreen = (payment: NfcPaymentData) => {
    console.log("[NFC] Navigating to pay screen with payment data");
    // Set the payment data first so the scan screen can access it
    setLastPayment(payment);
    // Navigate to the NFC scan screen which handles the payment flow
    router.push("/nfc/scan");
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
    </NfcContext.Provider>
  );
};
