/**
 * ENS Service
 *
 * ENS registry is deployed on mainnet and Sepolia.
 * All other EVM chains (Optimism, Base, Arbitrum…) don't have their own
 * registry, so we fall back to mainnet for both forward and reverse lookups.
 *
 * Uses viem for ENS resolution — it uses the Universal Resolver and has
 * reliable React Native / Hermes compatibility.
 */

import { ChainId, EthersClient } from "@/app/profiles/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getEnsAddress, getEnsName, getEnsText, normalize } from "viem/ens";

/**
 * SLIP-44 coin type for Solana. ENS uses this for non-EVM chains (ENSIP-9).
 * Solana's SLIP-44 coin type is 501.
 */
const SOLANA_COIN_TYPE = 501n;

/**
 * Returns the ENS coin type for a given chainId (ENSIP-11).
 * Mainnet ETH uses the legacy coin type 60.
 * All other EVM chains use 0x80000000 | chainId.
 */
function chainIdToEnsCoinType(chainId: ChainId): bigint {
  if (chainId === ChainId.mainnet) return 60n;
  return BigInt(0x80000000) + BigInt(chainId); // ENSIP-11 EVM coin type
}

/**
 * Chain name → ChainId registry for ENS interoperable names (ERC-7828).
 * Covers the chains registered under the `on.eth` namespace.
 */
const INTEROP_CHAIN_REGISTRY: Partial<Record<string, ChainId>> = {
  ethereum: ChainId.mainnet,
  eth: ChainId.mainnet,
  mainnet: ChainId.mainnet,
  base: ChainId.base,
  optimism: ChainId.optimism,
  op: ChainId.optimism,
  arbitrum: ChainId.arbitrum,
  arb1: ChainId.arbitrum,
  arb: ChainId.arbitrum,
  polygon: ChainId.polygon,
  matic: ChainId.polygon,
  avalanche: ChainId.avalanche,
  avax: ChainId.avalanche,
  bsc: ChainId.bsc,
  bnb: ChainId.bsc,
  zora: ChainId.zora,
  sepolia: ChainId.sepolia,
};

/** Chains we attempt to fetch ENSIP-11 addresses for in getAddresses() */
const MULTICHAIN_LOOKUP: Array<{ chainId: ChainId; label: string }> = [
  { chainId: ChainId.mainnet,  label: "Ethereum" },
  { chainId: ChainId.base,     label: "Base" },
  { chainId: ChainId.optimism, label: "Optimism" },
  { chainId: ChainId.arbitrum, label: "Arbitrum" },
  { chainId: ChainId.polygon,  label: "Polygon" },
  { chainId: ChainId.bsc,      label: "BNB Chain" },
];


/** Social text record keys we fetch */
const SOCIAL_KEYS = [
  "com.twitter",
  "com.github",
  "url",
  "email",
  "org.telegram",
  "com.discord",
  "com.reddit",
] as const;

/** All text record keys we attempt to fetch for a full profile */
const ALL_TEXT_KEYS = [
  "avatar", "description", "header", "display", "name",
  "location", "keywords", "notice",
  ...SOCIAL_KEYS,
  "com.linkedin", "com.instagram", "com.youtube",
  "io.keybase", "xyz.farcaster",
] as const;

export interface ENSSocial {
  platform: "twitter" | "github" | "website" | "email" | "telegram" | "discord" | "reddit";
  handle: string;
  url: string;
}

export interface ENSChainAddress {
  chainId: ChainId | "solana";
  chainName: string;
  address: string;
}

export interface ENSProfile {
  name: string;
  address: string;
  avatar?: string;
  header?: string;
  description?: string;
  displayName?: string;
  location?: string;
  keywords?: string[];
  notice?: string;
  socials: ENSSocial[];
  addresses: ENSChainAddress[];
  solanaAddress?: string;
  /** All non-null text records keyed by their ENS key (e.g. "com.twitter", "email") */
  textRecords: Record<string, string>;
}

// ─── Viem client for ENS ─────────────────────────────────────────────────────

const ensMainnetClient = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com", { batch: { wait: 50 } }),
});

// ─── Persistent cache ─────────────────────────────────────────────────────────

const FORWARD_TTL   = 24 * 60 * 60 * 1000;  // 24 hours
const REVERSE_TTL   = 24 * 60 * 60 * 1000;  // 24 hours
const PROFILE_TTL   = 12 * 60 * 60 * 1000;  // 12 hours
const ERROR_TTL     = 5 * 60 * 1000;          // 5 min — avoid hammering on failures

// One-time wipe of stale caches from the old broken RPC endpoints.
// Safe to remove this block after one release cycle.
const ENS_CACHE_VERSION_KEY = "ens_cache_version";
const ENS_CACHE_VERSION = "2"; // bump when RPC changes
AsyncStorage.getItem(ENS_CACHE_VERSION_KEY).then((v) => {
  if (v !== ENS_CACHE_VERSION) {
    AsyncStorage.multiRemove(["ens_cache_forward", "ens_cache_reverse", "ens_cache_profile"]).catch(() => {});
    AsyncStorage.setItem(ENS_CACHE_VERSION_KEY, ENS_CACHE_VERSION).catch(() => {});
  }
}).catch(() => {});

const STORAGE_KEY_FORWARD  = "ens_cache_forward";
const STORAGE_KEY_REVERSE  = "ens_cache_reverse";
const STORAGE_KEY_PROFILE  = "ens_cache_profile";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

type CacheMap<T> = Map<string, CacheEntry<T>>;

const forwardCache: CacheMap<string | null> = new Map();
const reverseCache: CacheMap<string | null> = new Map();
const profileCache: CacheMap<ENSProfile | null> = new Map();

let forwardCacheLoaded = false;
let reverseCacheLoaded = false;
let profileCacheLoaded = false;

async function loadCache<T>(
  key: string,
  target: CacheMap<T>,
  flag: () => boolean,
  setFlag: () => void,
) {
  if (flag()) return;
  setFlag();
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, CacheEntry<T>>;
      const now = Date.now();
      for (const [k, v] of Object.entries(obj)) {
        if (v.expiresAt > now) target.set(k, v);
      }
    }
  } catch {}
}

async function persistCache<T>(key: string, cache: CacheMap<T>) {
  try {
    const obj: Record<string, CacheEntry<T>> = {};
    for (const [k, v] of cache.entries()) obj[k] = v;
    await AsyncStorage.setItem(key, JSON.stringify(obj));
  } catch {}
}

// ─── In-flight deduplication ─────────────────────────────────────────────────

const inFlightForward = new Map<string, Promise<string | null>>();
const inFlightReverse = new Map<string, Promise<string | null>>();
const inFlightProfile = new Map<string, Promise<ENSProfile | null>>();

// ─── Concurrency limiter ───────────────────────────────────���─────────────────
// Prevents hammering the RPC when many components mount at once.

const MAX_CONCURRENT = 2;
let activeCalls = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCalls < MAX_CONCURRENT) {
    activeCalls++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => { activeCalls++; resolve(); });
  });
}

function releaseSlot() {
  activeCalls--;
  const next = waitQueue.shift();
  if (next) next();
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

function forwardKey(name: string, chainId: ChainId) {
  return `${name.toLowerCase()}_${chainId}`;
}
function reverseKey(address: string) {
  return address.toLowerCase();
}

// ─── ENSService ───────────────────────────────────────────────────────────────

export class ENSService {
  /**
   * Resolve a name (e.g. "vitalik.eth") → address.
   * Deduplicates concurrent calls and persists results to AsyncStorage.
   */
  static async resolve(
    name: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<string | null> {
    if (EthersClient.isValidAddress(name)) return name;
    if (!name.includes(".")) return null;

    await loadCache(STORAGE_KEY_FORWARD, forwardCache, () => forwardCacheLoaded, () => { forwardCacheLoaded = true; });

    const key = forwardKey(name, chainId);
    const cached = forwardCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    // Deduplicate in-flight
    if (inFlightForward.has(key)) return inFlightForward.get(key)!;

    const promise = (async (): Promise<string | null> => {
      await acquireSlot();
      try {
        const normalizedName = normalize(name);
        let result: string | null = null;

        if (chainId !== ChainId.mainnet) {
          const coinType = chainIdToEnsCoinType(chainId);
          const chainAddress = await getEnsAddress(ensMainnetClient, {
            name: normalizedName,
            coinType,
          });
          if (chainAddress) result = chainAddress;
        }

        if (!result) {
          const ethAddress = await getEnsAddress(ensMainnetClient, { name: normalizedName });
          result = ethAddress ?? null;
        }

        forwardCache.set(key, { value: result, expiresAt: Date.now() + FORWARD_TTL });
        persistCache(STORAGE_KEY_FORWARD, forwardCache);
        return result;
      } catch (err) {
        console.error("[ENSService]: Failed to resolve name:", name, err);
        forwardCache.set(key, { value: null, expiresAt: Date.now() + ERROR_TTL });
        return null;
      } finally {
        releaseSlot();
        inFlightForward.delete(key);
      }
    })();

    inFlightForward.set(key, promise);
    return promise;
  }

  /**
   * Reverse-lookup an address → primary ENS name.
   * Deduplicates concurrent calls and persists results to AsyncStorage.
   */
  static async reverseLookup(
    address: string,
    _chainId: ChainId = ChainId.mainnet,
  ): Promise<string | null> {
    if (!EthersClient.isValidAddress(address)) return null;

    await loadCache(STORAGE_KEY_REVERSE, reverseCache, () => reverseCacheLoaded, () => { reverseCacheLoaded = true; });

    const key = reverseKey(address);
    const cached = reverseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    if (inFlightReverse.has(key)) return inFlightReverse.get(key)!;

    const promise = (async (): Promise<string | null> => {
      await acquireSlot();
      try {
        const value = await getEnsName(ensMainnetClient, {
          address: address as `0x${string}`,
        });
        const result = value ?? null;
        reverseCache.set(key, { value: result, expiresAt: Date.now() + REVERSE_TTL });
        persistCache(STORAGE_KEY_REVERSE, reverseCache);
        return result;
      } catch (err) {
        console.error("[ENSService]: Failed to reverse-lookup address:", address, err);
        reverseCache.set(key, { value: null, expiresAt: Date.now() + ERROR_TTL });
        return null;
      } finally {
        releaseSlot();
        inFlightReverse.delete(key);
      }
    })();

    inFlightReverse.set(key, promise);
    return promise;
  }

  /**
   * Fetch the full ENS profile for a name: avatar, description, social links,
   * and resolved addresses across supported chains (ENSIP-11).
   *
   * Returns null if the name doesn't resolve at all.
   */
  static async getProfile(ensName: string): Promise<ENSProfile | null> {
    await loadCache(STORAGE_KEY_PROFILE, profileCache, () => profileCacheLoaded, () => { profileCacheLoaded = true; });

    const key = ensName.toLowerCase();
    const cached = profileCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    if (inFlightProfile.has(key)) return inFlightProfile.get(key)!;

    const promise = (async (): Promise<ENSProfile | null> => {
      await acquireSlot();
      try {
        const normalizedName = normalize(ensName);

        // Primary ETH address (required for the profile to be valid)
        const primaryAddress = await getEnsAddress(ensMainnetClient, { name: normalizedName });
        if (!primaryAddress) return null;

        // Fetch text records, multi-chain addresses, and Solana address in parallel
        const textKeys: string[] = [...ALL_TEXT_KEYS];
        const [textResults, chainAddresses, solanaResult, btcResult] = await Promise.all([
          Promise.allSettled(
            textKeys.map((k) =>
              getEnsText(ensMainnetClient, { name: normalizedName, key: k }).catch(() => null),
            ),
          ),
          Promise.allSettled(
            MULTICHAIN_LOOKUP.map(async ({ chainId, label }) => {
              const coinType = chainIdToEnsCoinType(chainId);
              try {
                let addr: string | null = null;
                if (chainId === ChainId.mainnet) {
                  addr = primaryAddress;
                } else {
                  const result = await getEnsAddress(ensMainnetClient, { name: normalizedName, coinType });
                  addr = result ?? null;
                }
                if (!addr) return null;
                return { chainId, chainName: label, address: addr } as ENSChainAddress;
              } catch {
                return null;
              }
            }),
          ),
          // Solana address via SLIP-44 coin type 501
          getEnsAddress(ensMainnetClient, { name: normalizedName, coinType: SOLANA_COIN_TYPE as any })
            .catch(() => null),
          // BTC address via SLIP-44 coin type 0
          getEnsAddress(ensMainnetClient, { name: normalizedName, coinType: 0n as any })
            .catch(() => null),
        ]);

        // Extract text values
        const textMap: Record<string, string | null> = {};
        textKeys.forEach((k, i) => {
          const r = textResults[i];
          textMap[k] = r.status === "fulfilled" ? (r.value ?? null) : null;
        });

        // Build textRecords: only non-null values
        const textRecords: Record<string, string> = {};
        for (const [k, v] of Object.entries(textMap)) {
          if (v) textRecords[k] = v;
        }

        // Use ENS metadata service for avatar URL — handles IPFS, NFT refs, and direct URLs
        const rawAvatar = textMap["avatar"];
        const avatar = rawAvatar
          ? `https://metadata.ens.domains/mainnet/avatar/${normalizedName}`
          : undefined;
        const description = textMap["description"] ?? undefined;
        const header = textMap["header"] ?? undefined;
        const displayName = textMap["display"] ?? textMap["name"] ?? undefined;
        const location = textMap["location"] ?? undefined;
        const keywords = textMap["keywords"]
          ? textMap["keywords"].split(",").map((k) => k.trim()).filter(Boolean)
          : undefined;
        const notice = textMap["notice"] ?? undefined;

        // Build social links
        const socials: ENSSocial[] = [];

        const twitterHandle = textMap["com.twitter"];
        if (twitterHandle) {
          const handle = twitterHandle.replace(/^@/, "").replace(/^https?:\/\/(www\.)?twitter\.com\//i, "").replace(/^https?:\/\/(www\.)?x\.com\//i, "");
          socials.push({ platform: "twitter", handle, url: `https://x.com/${handle}` });
        }
        const githubHandle = textMap["com.github"];
        if (githubHandle) {
          const handle = githubHandle.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
          socials.push({ platform: "github", handle, url: `https://github.com/${handle}` });
        }
        const website = textMap["url"];
        if (website) {
          socials.push({ platform: "website", handle: website.replace(/^https?:\/\//, ""), url: website });
        }
        const email = textMap["email"];
        if (email) {
          socials.push({ platform: "email", handle: email, url: `mailto:${email}` });
        }
        const telegram = textMap["org.telegram"];
        if (telegram) {
          const handle = telegram.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "");
          socials.push({ platform: "telegram", handle, url: `https://t.me/${handle}` });
        }
        const discord = textMap["com.discord"];
        if (discord) {
          socials.push({ platform: "discord", handle: discord, url: `https://discord.com/users/${discord}` });
        }
        const reddit = textMap["com.reddit"];
        if (reddit) {
          const handle = reddit.replace(/^u\//, "").replace(/^https?:\/\/(www\.)?reddit\.com\/u(ser)?\//, "");
          socials.push({ platform: "reddit", handle, url: `https://reddit.com/u/${handle}` });
        }

        // Build address list (only resolved ones)
        const addresses: ENSChainAddress[] = chainAddresses
          .map((r) => (r.status === "fulfilled" ? r.value : null))
          .filter((a): a is ENSChainAddress => a !== null);

        // Add Solana address if found
        const solanaAddr = solanaResult ?? null;
        if (solanaAddr) {
          addresses.push({ chainId: "solana", chainName: "Solana", address: solanaAddr });
        }

        // Add BTC address if found
        const btcAddr = btcResult ?? null;
        if (btcAddr) {
          addresses.push({ chainId: "btc" as any, chainName: "Bitcoin", address: btcAddr });
        }

        const profile: ENSProfile = {
          name: ensName,
          address: primaryAddress,
          avatar,
          header,
          description,
          displayName,
          location,
          keywords,
          notice,
          socials,
          addresses,
          solanaAddress: solanaAddr ?? undefined,
          textRecords,
        };

        profileCache.set(key, { value: profile, expiresAt: Date.now() + PROFILE_TTL });
        persistCache(STORAGE_KEY_PROFILE, profileCache);
        return profile;
      } catch (err) {
        console.error("[ENSService]: Failed to fetch profile for:", ensName, err);
        profileCache.set(key, { value: null, expiresAt: Date.now() + ERROR_TTL });
        return null;
      } finally {
        releaseSlot();
        inFlightProfile.delete(key);
      }
    })();

    inFlightProfile.set(key, promise);
    return promise;
  }

  /**
   * Resolve an ENS name to its Solana address (SLIP-44 coin type 501).
   * Returns null if no Solana address record is set.
   */
  static async resolveSolana(name: string): Promise<string | null> {
    if (!name.includes(".")) return null;
    try {
      const normalizedName = normalize(name);
      const result = await getEnsAddress(ensMainnetClient, {
        name: normalizedName,
        coinType: SOLANA_COIN_TYPE as any,
      });
      return result ?? null;
    } catch (err) {
      console.error("[ENSService]: Failed to resolve Solana address for:", name, err);
      return null;
    }
  }

  /**
   * Get the "last active" timestamp for an address by checking the latest
   * transaction nonce on mainnet. Returns the nonce (0 = never sent a tx)
   * and optionally the latest block timestamp if the address has activity.
   */
  static async getLastActive(address: string): Promise<{
    nonce: number;
    lastActiveTimestamp?: number;
  } | null> {
    if (!EthersClient.isValidAddress(address)) return null;

    try {
      // Use viem to get the nonce (transaction count) for the address
      const nonce = await ensMainnetClient.getTransactionCount({
        address: address as `0x${string}`,
      });

      if (nonce === 0) return { nonce: 0 };

      // If they have transactions, try to estimate last activity from latest block
      // This is a heuristic — for exact last tx time we'd need an indexer
      return { nonce };
    } catch (err) {
      console.error("[ENSService]: Failed to get last active for:", address, err);
      return null;
    }
  }

  /**
   * Clear all in-memory ENS caches.
   * Useful after switching RPCs or recovering from errors.
   */
  static clearCache() {
    forwardCache.clear();
    reverseCache.clear();
    profileCache.clear();
  }

  /**
   * Parse an ENS interoperable name (ERC-7828) like "vitalik.eth@base" or "alice@optimism".
   */
  static parseInteropName(
    input: string,
  ): { name: string; chainId: ChainId } | null {
    const atIdx = input.lastIndexOf("@");
    if (atIdx === -1) return null;

    const namePart = input.slice(0, atIdx).trim();
    const chainPart = input.slice(atIdx + 1).trim().toLowerCase();
    if (!namePart || !chainPart) return null;

    const chainId = INTEROP_CHAIN_REGISTRY[chainPart];
    if (chainId === undefined) return null;

    const name = namePart.includes(".") ? namePart : `${namePart}.eth`;
    return { name, chainId };
  }

  /**
   * Returns the ENS metadata service avatar URL for a name.
   * This handles all avatar formats: direct URLs, IPFS, NFT references.
   */
  static avatarUrl(ensName: string): string {
    return `https://metadata.ens.domains/mainnet/avatar/${ensName}`;
  }

  /** True if a string looks like it could be an ENS name (contains a dot). */
  static isENSName(value: string): boolean {
    return value.includes(".") && !EthersClient.isValidAddress(value);
  }

  /** True if the string contains an @chain suffix we recognise. */
  static isInteropName(value: string): boolean {
    return ENSService.parseInteropName(value) !== null;
  }

  /** Short display: "vitalik.eth" or "0x1234…5678" */
  static shortDisplay(
    address: string,
    ensName: string | null | undefined,
  ): string {
    if (ensName) return ensName;
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  /**
   * Get the resolver address for an ENS name.
   */
  static async getResolver(name: string): Promise<string | null> {
    try {
      const normalizedName = normalize(name);
      const resolver = await ensMainnetClient.getEnsResolver({ name: normalizedName });
      return resolver ?? null;
    } catch (err) {
      console.error("[ENSService]: Failed to get resolver for:", name, err);
      return null;
    }
  }

  /**
   * Set a text record on an ENS name.
   * Requires a signer (ethers Wallet) that owns/manages the name.
   *
   * Uses ethers.js Contract to call setText on the resolver.
   */
  static async setTextRecord(
    ensName: string,
    key: string,
    value: string,
    signer: any, // ethers.Wallet connected to mainnet
  ): Promise<{ hash: string } | { error: string }> {
    try {
      const { namehash, Contract } = await import("ethers");
      const normalizedName = normalize(ensName);
      const resolverAddr = await ENSService.getResolver(normalizedName);
      if (!resolverAddr) return { error: "No resolver found for this name" };

      const node = namehash(normalizedName);

      const RESOLVER_ABI = [
        "function setText(bytes32 node, string key, string value) external",
      ];

      const resolver = new Contract(resolverAddr, RESOLVER_ABI, signer);
      const tx = await resolver.setText(node, key, value);
      await tx.wait();

      // Invalidate profile cache
      profileCache.delete(ensName.toLowerCase());

      return { hash: tx.hash };
    } catch (err: any) {
      console.error("[ENSService]: Failed to set text record:", err);
      return { error: err.message || "Failed to set text record" };
    }
  }

  /**
   * Set the Solana address record on an ENS name.
   * Uses ENSIP-9 coin type 501 via setAddr(node, coinType, addressBytes).
   */
  static async setSolanaAddress(
    ensName: string,
    solanaAddress: string,
    signer: any, // ethers.Wallet connected to mainnet
  ): Promise<{ hash: string } | { error: string }> {
    try {
      const { namehash, Contract } = await import("ethers");
      // Solana addresses are base58. We need to encode them as bytes.
      // The resolver expects raw address bytes for non-EVM chains.
      const bs58 = await import("bs58" as any).catch(() => null);

      const normalizedName = normalize(ensName);
      const resolverAddr = await ENSService.getResolver(normalizedName);
      if (!resolverAddr) return { error: "No resolver found for this name" };

      const node = namehash(normalizedName);

      // Encode the Solana address to bytes
      let addrBytes: Uint8Array;
      if (bs58 && bs58.default?.decode) {
        addrBytes = bs58.default.decode(solanaAddress);
      } else {
        // Fallback: try to encode as-is (some resolvers accept string)
        addrBytes = new TextEncoder().encode(solanaAddress);
      }

      const RESOLVER_ABI = [
        "function setAddr(bytes32 node, uint256 coinType, bytes calldata a) external",
      ];

      const resolver = new Contract(resolverAddr, RESOLVER_ABI, signer);
      const tx = await resolver.setAddr(node, 501, addrBytes);
      await tx.wait();

      // Invalidate profile cache
      profileCache.delete(ensName.toLowerCase());

      return { hash: tx.hash };
    } catch (err: any) {
      console.error("[ENSService]: Failed to set Solana address:", err);
      return { error: err.message || "Failed to set Solana address" };
    }
  }
}
