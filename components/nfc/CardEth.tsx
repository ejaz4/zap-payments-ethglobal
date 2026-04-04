/**
 * CardEth - Ethereum wallet card component
 * Refactored to use ethers.js instead of viem
 */

import { ChainId, DEFAULT_NETWORKS, EthersClient } from "@/app/profiles/client";
import { formatBigInt } from "@/libs/bigInt";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Wallet } from "ethers";
import { ZapIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";

// Unified type for a single account object in private_keys
export type AccountMeta = {
  pk: `0x${string}`;
  nickname: string;
  seamless?: boolean;
  gradient?: string[];
  isGoverned?: boolean;
};

// Chain name to ChainId mapping
const chainNameToId: Record<string, ChainId> = {
  chiliz: ChainId.chilizSpicy,
  bsc: ChainId.bsc,
  avalanche: ChainId.avalanche,
  avalancheFuji: ChainId.avalanche,
  plasma: ChainId.plasmaTestnet,
  mainnet: ChainId.mainnet,
  polygon: ChainId.polygon,
  arbitrum: ChainId.arbitrum,
  optimism: ChainId.optimism,
  base: ChainId.base,
};

// Hook to get the account meta for a given private key from storage
export function useAccountMeta(
  privateKey: `0x${string}` | null,
): Omit<AccountMeta, "pk"> {
  const [nickname, setNickname] = useState<string>("");
  const [gradient, setGradient] = useState<string[]>(["#cccccc", "#cccccc"]);
  const [seamless, setSeamless] = useState<boolean>(false);
  const [isGoverned, setIsGoverned] = useState<boolean>(false);

  useEffect(() => {
    if (!privateKey) {
      setNickname("");
      setGradient(["#ff9966", "#ff5e62"]);
      setIsGoverned(false);
      return;
    }
    AsyncStorage.getItem("private_keys").then((val) => {
      if (!val) {
        setNickname("");
        setGradient(["#ff9966", "#ff5e62"]);
        setIsGoverned(false);
        return;
      }
      try {
        const arr: AccountMeta[] = JSON.parse(val);
        if (Array.isArray(arr)) {
          const found = arr.find((obj) => obj.pk === privateKey);
          setNickname(found?.nickname ?? "");
          setGradient(found?.gradient ?? ["#ff9966", "#ff5e62"]);
          setSeamless(found?.seamless ?? false);
          setIsGoverned(found?.isGoverned ?? false);
        } else {
          setNickname("");
          setGradient(["#ff9966", "#ff5e62"]);
          setIsGoverned(false);
        }
      } catch {
        setNickname("");
        setGradient(["#ff9966", "#ff5e62"]);
        setIsGoverned(false);
      }
    });
  }, [privateKey]);

  return { nickname, gradient, seamless, isGoverned };
}

export const CardEth = ({
  privateKey,
  chain = "chiliz",
}: {
  privateKey: `0x${string}` | null;
  chain: string;
}) => {
  // Get chain config using EthersClient
  const chainId = chainNameToId[chain] || ChainId.chilizSpicy;
  const networkConfig = DEFAULT_NETWORKS[chainId];
  const decimals = networkConfig?.nativeCurrency.decimals || 18;
  const symbol = networkConfig?.nativeCurrency.symbol || "ETH";

  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const { nickname, gradient, seamless, isGoverned } =
    useAccountMeta(privateKey);

  // Create wallet and get address
  useEffect(() => {
    if (!privateKey) {
      setAddress(null);
      return;
    }
    try {
      const wallet = new Wallet(privateKey);
      setAddress(wallet.address);
    } catch (e) {
      console.error(e);
      setAddress(null);
    }
  }, [privateKey]);

  // Fetch balance using ethers provider
  useEffect(() => {
    if (!address) return;

    const fetchBalance = async () => {
      try {
        const provider = EthersClient.getProvider(chainId);
        const bal = await provider.getBalance(address);
        setBalance(bal);
      } catch (e) {
        console.error("[CardEth] Failed to fetch balance:", e);
      }
    };

    fetchBalance();
  }, [address, chainId]);

  if (!address) {
    return (
      <LinearGradient
        colors={gradient ?? ["#ff9966", "#ff5e62"]}
        style={{
          height: 200,
          width: "100%",
          justifyContent: "space-between",
          padding: 16,
          borderRadius: 16,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "white" }}>
          {[...Array(15)].map(() => "█")}
        </Text>
        <View>
          <Text style={{ color: "white" }}>{[...Array(8)].map(() => "█")}</Text>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "white" }}>
            {[...Array(10)].map(() => "█")}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={gradient ?? ["#ff9966", "#ff5e62"]}
      style={{
        height: 200,
        width: "100%",
        justifyContent: "space-between",
        padding: 16,
        borderRadius: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {seamless && <ZapIcon size={18} color={"white"} fill={"white"} />}
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "white" }}>
          {nickname}
        </Text>
      </View>
      <View>
        <Text style={{ color: "white" }}>
          {address.slice(0, 6)}...{address.slice(-4)}
        </Text>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "white" }}>
          {balance != null
            ? `${symbol} ${formatBigInt(balance, decimals)}`
            : "Loading..."}
        </Text>
      </View>
    </LinearGradient>
  );
};
