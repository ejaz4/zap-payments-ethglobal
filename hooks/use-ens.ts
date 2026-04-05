import { ChainId } from "@/app/profiles/client";
import { ENSProfile, ENSService } from "@/services/ens";
import { useEffect, useRef, useState } from "react";

/**
 * Reverse-resolve an address to its ENS name.
 * Returns null while loading or if no ENS name is set.
 * Debounced to avoid hammering the RPC on rapid changes.
 */
export function useENSName(
  address: string | null | undefined,
  chainId: ChainId,
): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setName(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      ENSService.reverseLookup(address, chainId).then((n) => {
        if (!cancelled) setName(n);
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address, chainId]);

  return name;
}

/**
 * Forward-resolve an ENS name (or interoperable name like "alice@base") to an address.
 * Pass a raw address and it is returned as-is.
 *
 * Returns:
 *   address        — resolved 0x address, or null
 *   loading        — true while resolving
 *   error          — error string, or null
 *   detectedChainId — chainId parsed from an "@chain" suffix, or null
 */
export function useENSAddress(
  nameOrAddress: string,
  chainId: ChainId,
): {
  address: string | null;
  loading: boolean;
  error: string | null;
  detectedChainId: ChainId | null;
} {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedChainId, setDetectedChainId] = useState<ChainId | null>(null);

  useEffect(() => {
    if (!nameOrAddress) {
      setAddress(null);
      setLoading(false);
      setError(null);
      setDetectedChainId(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      // Check for interoperable name like "vitalik.eth@base" or "alice@optimism"
      const interop = ENSService.parseInteropName(nameOrAddress);
      const resolveChain = interop ? interop.chainId : chainId;
      const resolveName = interop ? interop.name : nameOrAddress;

      const resolved = await ENSService.resolve(resolveName, resolveChain);

      if (!cancelled) {
        setAddress(resolved);
        setDetectedChainId(interop ? interop.chainId : null);
        setError(null);
        setLoading(false);
      }
    };

    // Debounce 400ms so we don't fire on every keystroke
    const timer = setTimeout(run, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nameOrAddress, chainId]);

  return { address, loading, error, detectedChainId };
}

/**
 * Fetch the full ENS profile for a name.
 * Returns the profile, loading state, and a refresh function.
 */
export function useENSProfile(
  ensName: string | null | undefined,
): {
  profile: ENSProfile | null;
  loading: boolean;
  refresh: () => void;
} {
  const [profile, setProfile] = useState<ENSProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef(0);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!ensName) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    ENSService.getProfile(ensName).then((p) => {
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ensName, refreshCount]);

  const refresh = () => {
    refreshRef.current += 1;
    setRefreshCount(refreshRef.current);
  };

  return { profile, loading, refresh };
}

/**
 * Resolve an ENS name to its Solana address (coin type 501).
 * Returns null while loading or if no SOL record is set.
 */
export function useENSSolanaAddress(
  ensName: string | null | undefined,
): {
  solanaAddress: string | null;
  loading: boolean;
} {
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ensName) {
      setSolanaAddress(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    ENSService.resolveSolana(ensName).then((addr) => {
      if (!cancelled) {
        setSolanaAddress(addr);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ensName]);

  return { solanaAddress, loading };
}

/**
 * Get the "last active" info for an address (transaction count on mainnet).
 * Debounced to avoid slamming the RPC when many contacts render at once.
 */
export function useLastActive(
  address: string | null | undefined,
): {
  nonce: number | null;
  loading: boolean;
} {
  const [nonce, setNonce] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setNonce(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Stagger requests so rendering a list of contacts doesn't fire all at once
    const delay = Math.random() * 2000 + 500;
    const timer = setTimeout(() => {
      ENSService.getLastActive(address).then((result) => {
        if (!cancelled) {
          setNonce(result?.nonce ?? null);
          setLoading(false);
        }
      });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address]);

  return { nonce, loading };
}
