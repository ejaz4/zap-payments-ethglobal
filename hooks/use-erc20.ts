import { EthersClient } from "@/app/profiles/client";
import { TokenInfo } from "@/config/tokens";
import { ApprovalStatus, ERC20Service } from "@/services/erc20";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { useCallback, useState } from "react";

/**
 * Hook state for ERC20 operations
 */
interface UseERC20State {
  isLoading: boolean;
  error: string | null;
  approvalStatus: ApprovalStatus | null;
}

/**
 * Return type for useERC20 hook
 */
interface UseERC20Return extends UseERC20State {
  // Check approval status
  checkApproval: (
    tokenAddress: string,
    spenderAddress: string,
    requiredAmount: string,
    decimals: number,
  ) => Promise<ApprovalStatus | null>;

  // Approve tokens
  approve: (
    tokenAddress: string,
    spenderAddress: string,
    amount: string,
    decimals: number,
  ) => Promise<{ success: boolean; hash?: string; error?: string }>;

  // Approve unlimited
  approveUnlimited: (
    tokenAddress: string,
    spenderAddress: string,
  ) => Promise<{ success: boolean; hash?: string; error?: string }>;

  // Revoke approval
  revokeApproval: (
    tokenAddress: string,
    spenderAddress: string,
  ) => Promise<{ success: boolean; hash?: string; error?: string }>;

  // Transfer tokens
  transfer: (
    tokenAddress: string,
    toAddress: string,
    amount: string,
    decimals: number,
  ) => Promise<{ success: boolean; hash?: string; error?: string }>;

  // Get token balance
  getBalance: (
    tokenAddress: string,
    decimals: number,
  ) => Promise<string | null>;

  // Reset state
  reset: () => void;
}

/**
 * Hook for ERC20 token operations
 * Provides methods for approval, transfer, and balance checking
 */
export function useERC20(): UseERC20Return {
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);

  const [state, setState] = useState<UseERC20State>({
    isLoading: false,
    error: null,
    approvalStatus: null,
  });

  const setLoading = (isLoading: boolean) => {
    setState((prev) => ({
      ...prev,
      isLoading,
      error: isLoading ? null : prev.error,
    }));
  };

  const setError = (error: string | null) => {
    setState((prev) => ({ ...prev, error, isLoading: false }));
  };

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, approvalStatus: null });
  }, []);

  const checkApproval = useCallback(
    async (
      tokenAddress: string,
      spenderAddress: string,
      requiredAmount: string,
      decimals: number,
    ): Promise<ApprovalStatus | null> => {
      if (!selectedAccount) {
        setError("No wallet connected");
        return null;
      }

      try {
        setLoading(true);
        const requiredWei = EthersClient.parseUnits(requiredAmount, decimals);
        const status = await ERC20Service.checkApprovalStatus(
          tokenAddress,
          selectedAccount.address,
          spenderAddress,
          requiredWei,
          decimals,
          selectedChainId,
        );
        setState((prev) => ({
          ...prev,
          approvalStatus: status,
          isLoading: false,
        }));
        return status;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to check approval";
        setError(message);
        return null;
      }
    },
    [selectedAccount, selectedChainId],
  );

  const approve = useCallback(
    async (
      tokenAddress: string,
      spenderAddress: string,
      amount: string,
      decimals: number,
    ): Promise<{ success: boolean; hash?: string; error?: string }> => {
      if (!selectedAccount) {
        return { success: false, error: "No wallet connected" };
      }

      try {
        setLoading(true);
        const result = await ERC20Service.approveExact(
          selectedAccount.address,
          tokenAddress,
          spenderAddress,
          amount,
          decimals,
          selectedChainId,
        );
        setLoading(false);
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Approval failed";
        setError(message);
        return { success: false, error: message };
      }
    },
    [selectedAccount, selectedChainId],
  );

  const approveUnlimited = useCallback(
    async (
      tokenAddress: string,
      spenderAddress: string,
    ): Promise<{ success: boolean; hash?: string; error?: string }> => {
      if (!selectedAccount) {
        return { success: false, error: "No wallet connected" };
      }

      try {
        setLoading(true);
        const result = await ERC20Service.approveUnlimited(
          selectedAccount.address,
          tokenAddress,
          spenderAddress,
          selectedChainId,
        );
        setLoading(false);
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Approval failed";
        setError(message);
        return { success: false, error: message };
      }
    },
    [selectedAccount, selectedChainId],
  );

  const revokeApproval = useCallback(
    async (
      tokenAddress: string,
      spenderAddress: string,
    ): Promise<{ success: boolean; hash?: string; error?: string }> => {
      if (!selectedAccount) {
        return { success: false, error: "No wallet connected" };
      }

      try {
        setLoading(true);
        const result = await ERC20Service.revokeApproval(
          selectedAccount.address,
          tokenAddress,
          spenderAddress,
          selectedChainId,
        );
        setLoading(false);
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Revoke failed";
        setError(message);
        return { success: false, error: message };
      }
    },
    [selectedAccount, selectedChainId],
  );

  const transfer = useCallback(
    async (
      tokenAddress: string,
      toAddress: string,
      amount: string,
      decimals: number,
    ): Promise<{ success: boolean; hash?: string; error?: string }> => {
      if (!selectedAccount) {
        return { success: false, error: "No wallet connected" };
      }

      try {
        setLoading(true);
        const result = await ERC20Service.transfer(
          selectedAccount.address,
          toAddress,
          tokenAddress,
          amount,
          decimals,
          selectedChainId,
        );

        if ("hash" in result) {
          setLoading(false);
          return { success: true, hash: result.hash };
        } else {
          setError(result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Transfer failed";
        setError(message);
        return { success: false, error: message };
      }
    },
    [selectedAccount, selectedChainId],
  );

  const getBalance = useCallback(
    async (tokenAddress: string, decimals: number): Promise<string | null> => {
      if (!selectedAccount) {
        return null;
      }

      try {
        return await ERC20Service.getFormattedBalance(
          tokenAddress,
          selectedAccount.address,
          decimals,
          selectedChainId,
        );
      } catch (error) {
        console.error("Failed to get balance:", error);
        return null;
      }
    },
    [selectedAccount, selectedChainId],
  );

  return {
    ...state,
    checkApproval,
    approve,
    approveUnlimited,
    revokeApproval,
    transfer,
    getBalance,
    reset,
  };
}

/**
 * Hook for checking if a token needs approval
 * Returns a simplified boolean check
 */
export function useNeedsApproval(
  token: TokenInfo | null,
  spenderAddress: string | null,
  amount: string,
) {
  const [needsApproval, setNeedsApproval] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);

  const check = useCallback(async () => {
    if (
      !token ||
      !spenderAddress ||
      !selectedAccount ||
      !amount ||
      parseFloat(amount) <= 0
    ) {
      setNeedsApproval(null);
      return;
    }

    try {
      setIsChecking(true);
      const amountWei = EthersClient.parseUnits(amount, token.decimals);
      const needs = await ERC20Service.needsApproval(
        token.address,
        selectedAccount.address,
        spenderAddress,
        amountWei,
        selectedChainId,
      );
      setNeedsApproval(needs);
    } catch (error) {
      console.error("Failed to check approval:", error);
      setNeedsApproval(null);
    } finally {
      setIsChecking(false);
    }
  }, [token, spenderAddress, selectedAccount, amount, selectedChainId]);

  return { needsApproval, isChecking, check };
}

export default useERC20;
