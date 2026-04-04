/**
 * Zap Contract Deployment Service
 * Handles deploying the Zap Payment Terminal contract
 */

import { ChainId, EthersClient } from "@/app/profiles/client";
import { ZAP_CONTRACT_ABI, ZAP_CONTRACT_BYTECODE } from "@/config/zap-contract";
import { SecureStorage } from "@/services/storage";
import { Contract, ContractFactory, formatUnits, isAddress } from "ethers";

export interface DeploymentResult {
  success: boolean;
  contractAddress?: string;
  txHash?: string;
  error?: string;
}

export interface VerificationResult {
  isValid: boolean;
  isOwner: boolean;
  error?: string;
}

export interface ContractBalance {
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  decimals: number;
  tokenAddress: string; // "native" for native token, contract address for ERC20
}

export interface WithdrawResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Service for deploying and verifying Zap Payment Terminal contracts
 */
export class ZapContractService {
  /**
   * Deploy a new Zap Payment Terminal contract
   * @param walletAddress - The wallet address that will own the contract
   * @param chainId - The chain to deploy on
   * @returns Deployment result with contract address or error
   */
  static async deployContract(
    walletAddress: string,
    chainId: ChainId,
  ): Promise<DeploymentResult> {
    try {
      console.log("[ZapContractService] Starting deployment...", {
        walletAddress,
        chainId,
      });

      // Get private key for signing
      const privateKey = await SecureStorage.loadPrivateKey(walletAddress);
      if (!privateKey) {
        return {
          success: false,
          error:
            "Private key not found. Please ensure your wallet is unlocked.",
        };
      }

      // Create wallet signer
      const wallet = EthersClient.createWallet(privateKey, chainId);
      console.log("[ZapContractService] Wallet created");

      // Check balance
      const balance = await wallet.provider?.getBalance(walletAddress);
      if (!balance || balance === 0n) {
        const network = EthersClient.getNetworkConfig(chainId);
        return {
          success: false,
          error: `Insufficient ${network?.nativeCurrency.symbol || "ETH"} balance for deployment. Please add funds to your wallet.`,
        };
      }

      // Create contract factory
      const factory = new ContractFactory(
        ZAP_CONTRACT_ABI,
        ZAP_CONTRACT_BYTECODE,
        wallet,
      );

      console.log("[ZapContractService] Deploying contract...");

      // Deploy the contract with owner address as constructor argument
      const contract = await factory.deploy(walletAddress);

      console.log("[ZapContractService] Waiting for deployment...");

      // Wait for deployment to complete
      await contract.waitForDeployment();

      const contractAddress = await contract.getAddress();
      const deployTx = contract.deploymentTransaction();

      console.log("[ZapContractService] Contract deployed!", {
        contractAddress,
        txHash: deployTx?.hash,
      });

      return {
        success: true,
        contractAddress,
        txHash: deployTx?.hash,
      };
    } catch (error: any) {
      console.error("[ZapContractService] Deployment failed:", error);

      // Parse common errors
      let errorMessage = "Deployment failed";
      if (error.message?.includes("insufficient funds")) {
        const network = EthersClient.getNetworkConfig(chainId);
        errorMessage = `Insufficient ${network?.nativeCurrency.symbol || "ETH"} for gas fees`;
      } else if (error.message?.includes("nonce")) {
        errorMessage = "Transaction nonce error. Please try again.";
      } else if (error.code === "NETWORK_ERROR") {
        errorMessage = "Network error. Please check your connection.";
      } else if (error.message) {
        errorMessage = error.message.slice(0, 100);
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Verify a contract address is valid and check ownership
   * @param contractAddress - The contract address to verify
   * @param walletAddress - The expected owner address
   * @param chainId - The chain the contract is on
   */
  static async verifyContract(
    contractAddress: string,
    walletAddress: string,
    chainId: ChainId,
  ): Promise<VerificationResult> {
    try {
      // Basic address validation
      if (!isAddress(contractAddress)) {
        return {
          isValid: false,
          isOwner: false,
          error: "Invalid contract address format",
        };
      }

      const provider = EthersClient.getProvider(chainId);

      // Check if there's code at the address
      const code = await provider.getCode(contractAddress);
      if (code === "0x") {
        return {
          isValid: false,
          isOwner: false,
          error: "No contract found at this address",
        };
      }

      // Try to get the owner
      const contract = new Contract(
        contractAddress,
        ZAP_CONTRACT_ABI,
        provider,
      );

      try {
        const owner = await contract.owner();
        const isOwner = owner.toLowerCase() === walletAddress.toLowerCase();

        return {
          isValid: true,
          isOwner,
          error: isOwner ? undefined : "You are not the owner of this contract",
        };
      } catch {
        // Contract exists but might not have owner function (different contract)
        return {
          isValid: false,
          isOwner: false,
          error: "Contract does not appear to be a Zap Payment Terminal",
        };
      }
    } catch (error: any) {
      console.error("[ZapContractService] Verification failed:", error);
      return {
        isValid: false,
        isOwner: false,
        error: error.message || "Failed to verify contract",
      };
    }
  }

  /**
   * Get transaction count from a deployed contract
   */
  static async getTransactionCount(
    contractAddress: string,
    chainId: ChainId,
  ): Promise<bigint | null> {
    try {
      const provider = EthersClient.getProvider(chainId);
      const contract = new Contract(
        contractAddress,
        ZAP_CONTRACT_ABI,
        provider,
      );
      return await contract.txCounter();
    } catch {
      return null;
    }
  }

  /**
   * Get contract balances (native + known ERC20 tokens)
   */
  static async getContractBalances(
    contractAddress: string,
    chainId: ChainId,
    tokenAddresses: string[] = [],
  ): Promise<ContractBalance[]> {
    const balances: ContractBalance[] = [];
    const provider = EthersClient.getProvider(chainId);
    const networkConfig = EthersClient.getNetworkConfig(chainId);

    try {
      // Get native balance
      const nativeBalance = await provider.getBalance(contractAddress);
      if (nativeBalance > 0n) {
        balances.push({
          symbol: networkConfig?.nativeCurrency.symbol || "ETH",
          name: networkConfig?.nativeCurrency.name || "Ether",
          balance: nativeBalance.toString(),
          balanceFormatted: formatUnits(nativeBalance, 18),
          decimals: 18,
          tokenAddress: "native",
        });
      }

      // Get ERC20 balances
      const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
        "function name() view returns (string)",
      ];

      for (const tokenAddress of tokenAddresses) {
        try {
          const tokenContract = new Contract(tokenAddress, erc20Abi, provider);
          const [balance, decimals, symbol, name] = await Promise.all([
            tokenContract.balanceOf(contractAddress),
            tokenContract.decimals(),
            tokenContract.symbol(),
            tokenContract.name(),
          ]);

          if (balance > 0n) {
            balances.push({
              symbol,
              name,
              balance: balance.toString(),
              balanceFormatted: formatUnits(balance, decimals),
              decimals,
              tokenAddress,
            });
          }
        } catch (err) {
          console.warn(
            `[ZapContractService] Failed to get balance for ${tokenAddress}:`,
            err,
          );
        }
      }
    } catch (error) {
      console.error("[ZapContractService] getContractBalances error:", error);
    }

    return balances;
  }

  /**
   * Withdraw native token from contract
   * Contract function: withdraw(address payable to, address tokenContract)
   * For native tokens, tokenContract is zero address
   */
  static async withdrawNative(
    contractAddress: string,
    walletAddress: string,
    chainId: ChainId,
  ): Promise<WithdrawResult> {
    try {
      const privateKey = await SecureStorage.loadPrivateKey(walletAddress);
      if (!privateKey) {
        return { success: false, error: "Private key not found" };
      }

      const wallet = EthersClient.createWallet(privateKey, chainId);
      const contract = new Contract(contractAddress, ZAP_CONTRACT_ABI, wallet);

      // Zero address for native token withdrawal
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
      const tx = await contract.withdraw(walletAddress, ZERO_ADDRESS);
      await tx.wait();

      return { success: true, txHash: tx.hash };
    } catch (error: any) {
      console.error("[ZapContractService] withdrawNative error:", error);
      return { success: false, error: error.message || "Withdrawal failed" };
    }
  }

  /**
   * Withdraw ERC20 token from contract
   * Contract function: withdraw(address payable to, address tokenContract)
   */
  static async withdrawERC20(
    contractAddress: string,
    walletAddress: string,
    chainId: ChainId,
    tokenAddress: string,
  ): Promise<WithdrawResult> {
    try {
      const privateKey = await SecureStorage.loadPrivateKey(walletAddress);
      if (!privateKey) {
        return { success: false, error: "Private key not found" };
      }

      const wallet = EthersClient.createWallet(privateKey, chainId);
      const contract = new Contract(contractAddress, ZAP_CONTRACT_ABI, wallet);

      const tx = await contract.withdraw(walletAddress, tokenAddress);
      await tx.wait();

      return { success: true, txHash: tx.hash };
    } catch (error: any) {
      console.error("[ZapContractService] withdrawERC20 error:", error);
      return { success: false, error: error.message || "Withdrawal failed" };
    }
  }

  /**
   * Withdraw all balances from contract
   */
  static async withdrawAll(
    contractAddress: string,
    walletAddress: string,
    chainId: ChainId,
    balances: ContractBalance[],
  ): Promise<WithdrawResult> {
    try {
      for (const balance of balances) {
        if (balance.tokenAddress === "native") {
          const result = await this.withdrawNative(
            contractAddress,
            walletAddress,
            chainId,
          );
          if (!result.success) {
            return result;
          }
        } else {
          const result = await this.withdrawERC20(
            contractAddress,
            walletAddress,
            chainId,
            balance.tokenAddress,
          );
          if (!result.success) {
            return result;
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error("[ZapContractService] withdrawAll error:", error);
      return { success: false, error: error.message || "Withdrawal failed" };
    }
  }
}
