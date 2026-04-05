import { ChainId, EthersClient } from "@/app/profiles/client";
import { Contract, formatUnits } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Represents an incoming ERC20 transfer detected by the listener.
 */
export interface IncomingTransfer {
  /** ERC20 token contract address */
  token: string;
  /** Sender address */
  from: string;
  /** Formatted (human-readable) amount */
  formatted: string;
  /** Raw amount as string */
  raw: string;
  /** Token symbol (resolved on-chain) */
  symbol: string;
  /** Token decimals (resolved on-chain) */
  decimals: number;
  /** Transaction hash */
  txHash: string;
}

const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ERC20_META_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

/**
 * Listen for incoming ERC-20 Transfer events where `to` is the given address.
 *
 * Uses ethers.js v6 provider log subscriptions. Captures the first incoming
 * transfer and stops listening. Re-activates when `active` becomes true.
 *
 * Mirrors smart-swap-hub's `useErc20Listener` hook.
 */
export function useErc20Listener(
  recipientAddress: string | undefined,
  chainId: ChainId,
  active: boolean,
) {
  const [transfer, setTransfer] = useState<IncomingTransfer | null>(null);
  const [listening, setListening] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setTransfer(null);
    setListening(false);
  }, []);

  useEffect(() => {
    if (!active || !recipientAddress) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setListening(false);
      return;
    }

    const provider = EthersClient.getProvider(chainId);

    // Pad address to 32 bytes for topic filter
    const paddedAddress =
      "0x" + recipientAddress.slice(2).toLowerCase().padStart(64, "0");

    const filter = {
      topics: [
        TRANSFER_EVENT_TOPIC,
        null, // from (any)
        paddedAddress, // to (our address)
      ],
    };

    let cancelled = false;

    const handleLog = async (log: any) => {
      if (cancelled) return;

      // Stop listening after first transfer
      cleanupRef.current?.();
      cleanupRef.current = null;

      try {
        const tokenAddress = log.address;
        const rawAmount = BigInt(log.data);

        // Extract `from` from topics[1]
        const fromTopic = log.topics[1] as string;
        const from = "0x" + fromTopic.slice(26);

        // Resolve token metadata on-chain
        let symbol = "???";
        let decimals = 18;
        try {
          const contract = new Contract(
            tokenAddress,
            ERC20_META_ABI,
            provider,
          );
          const [sym, dec] = await Promise.all([
            contract.symbol(),
            contract.decimals(),
          ]);
          symbol = sym;
          decimals = Number(dec);
        } catch {
          // Use defaults if metadata call fails
        }

        const formatted = formatUnits(rawAmount, decimals);

        setTransfer({
          token: tokenAddress,
          from,
          formatted,
          raw: rawAmount.toString(),
          symbol,
          decimals,
          txHash: log.transactionHash,
        });
      } catch (err) {
        console.warn("[useErc20Listener] Error processing log:", err);
      }

      setListening(false);
    };

    // Start listening
    setListening(true);
    provider.on(filter, handleLog);

    cleanupRef.current = () => {
      cancelled = true;
      provider.off(filter, handleLog);
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [active, recipientAddress, chainId]);

  return { transfer, listening, reset };
}
