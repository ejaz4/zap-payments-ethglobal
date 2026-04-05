import { uniswapApiCall } from "@/services/uniswap";
import { WalletService } from "@/services/wallet";
import { useUniswapStore } from "@/store/uniswap";
import { useState } from "react";
import type { UniswapQuoteResult } from "./use-uniswap-quote";

export type SwapStep =
  | "idle"
  | "checking-approval"
  | "approving"
  | "signing-permit"
  | "building-swap"
  | "swapping"
  | "done"
  | "error";

const UNISWAPX_ROUTING = ["DUTCH_V2", "DUTCH_V3", "PRIORITY"];

/**
 * Execute a swap via the Uniswap Trading API.
 *
 * Adapted from smart-swap-hub's useApiSwapExecution for ethers.js v6
 * with the app's existing wallet/signer infrastructure.
 */
export function useSwapExecution() {
  const [step, setStep] = useState<SwapStep>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiKey = useUniswapStore((s) => s.apiKey);

  const executeSwap = async (
    quoteResult: UniswapQuoteResult,
    walletAddress: string,
  ) => {
    if (!walletAddress || !apiKey) {
      setError("Wallet not connected or API key missing");
      return;
    }

    try {
      setStep("idle");
      setError(null);
      setTxHash(null);

      const chainId = quoteResult.chainId;
      const signer = await WalletService.getSigner(walletAddress, chainId);
      if (!signer) {
        throw new Error("Could not load wallet signer");
      }
      // Step 1: Check approval
      setStep("checking-approval");
      try {
        const { data: approvalData } = await uniswapApiCall(
          "check_approval",
          apiKey,
          {
            token:
              quoteResult.quote.tokenIn ||
              quoteResult.quote.input?.token,
            amount:
              quoteResult.quote.amountIn ||
              quoteResult.quote.input?.amount,
            walletAddress,
            chainId,
          },
        );

        if (approvalData.approval) {
          setStep("approving");
          const approveTx = approvalData.approval;
          const txResponse = await signer.sendTransaction({
            to: approveTx.to,
            data: approveTx.data,
            value: BigInt(approveTx.value || "0"),
          });
          await txResponse.wait(1);
        }
      } catch {
        // check_approval may fail on testnets — continue
      }

      // Step 2: Sign Permit2 if needed
      let signature: string | undefined;
      if (quoteResult.permitData) {
        setStep("signing-permit");
        const { domain, types, values } = quoteResult.permitData;

        // ethers.js v6 signTypedData(domain, types, value)
        // Remove EIP712Domain from types — ethers derives it from the domain
        const cleanTypes = { ...types };
        delete cleanTypes.EIP712Domain;

        signature = await signer.signTypedData(domain, cleanTypes, values);
      }

      // Step 3: Build and execute swap or order
      const isUniswapX = UNISWAPX_ROUTING.includes(quoteResult.routing);
      const endpoint = isUniswapX ? "order" : "swap";

      setStep("building-swap");
      const swapBody: Record<string, unknown> = {
        quote: quoteResult.quote,
      };
      if (signature && quoteResult.permitData) {
        swapBody.signature = signature;
        swapBody.permitData = quoteResult.permitData;
      }

      const { data: swapData } = await uniswapApiCall(
        endpoint,
        apiKey,
        swapBody,
      );

      if (isUniswapX) {
        // UniswapX order — no on-chain tx from us
        setTxHash(
          swapData.orderHash || swapData.hash || "order-submitted",
        );
        setStep("done");
      } else {
        // Classic swap — send the transaction
        const tx = swapData.swap;
        if (!tx?.data || tx.data === "" || tx.data === "0x") {
          throw new Error("Invalid swap: empty data field from API");
        }

        setStep("swapping");
        const txResponse = await signer.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: BigInt(tx.value || "0"),
          ...(tx.gasLimit ? { gasLimit: BigInt(tx.gasLimit) } : {}),
        });

        setTxHash(txResponse.hash);
        await txResponse.wait(1);
        setStep("done");
      }
    } catch (err: unknown) {
      setStep("error");
      const msg = err instanceof Error ? err.message : "Swap failed";
      if (msg.includes("User rejected") || msg.includes("ACTION_REJECTED")) {
        setError("Transaction rejected by user");
      } else {
        setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
      }
    }
  };

  const reset = () => {
    setStep("idle");
    setTxHash(null);
    setError(null);
  };

  return { executeSwap, step, txHash, error, reset };
}
