/**
 * Browser Provider Service
 * Handles Ethereum provider requests from DApps in the browser
 * Supports all standard EIP-1193 methods
 */

import { ChainId, EthersClient } from "@/app/profiles/client";
import { SecureStorage } from "@/services/storage";
import { getDappHost, useBrowserStore } from "@/store/browser";
import { useWalletStore } from "@/store/wallet";

/**
 * Provider request from DApp
 */
export interface ProviderRequest {
  id: number;
  method: string;
  params: unknown[];
  origin: string;
  host: string;
  title?: string;
}

/**
 * Provider response to DApp
 */
export interface ProviderResponse {
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Pending approval request
 */
export interface PendingApproval {
  id: number;
  type:
    | "connect"
    | "sign_message"
    | "sign_transaction"
    | "sign_typed_data"
    | "switch_chain"
    | "add_chain";
  request: ProviderRequest;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

// Store pending approvals that need user confirmation
let pendingApprovals: PendingApproval[] = [];
let approvalCallback: ((approval: PendingApproval) => void) | null = null;

/**
 * Set callback to handle approval requests (called from UI)
 */
export function setApprovalCallback(
  callback: ((approval: PendingApproval) => void) | null,
) {
  approvalCallback = callback;

  // Process any pending approvals
  if (callback && pendingApprovals.length > 0) {
    const approval = pendingApprovals[0];
    callback(approval);
  }
}

/**
 * Resolve a pending approval
 */
export function resolveApproval(id: number, result: unknown) {
  const index = pendingApprovals.findIndex((a) => a.id === id);
  if (index >= 0) {
    const approval = pendingApprovals[index];
    pendingApprovals.splice(index, 1);
    approval.resolve(result);

    // Process next approval if any
    if (approvalCallback && pendingApprovals.length > 0) {
      approvalCallback(pendingApprovals[0]);
    }
  }
}

/**
 * Reject a pending approval
 */
export function rejectApproval(
  id: number,
  message = "User rejected the request",
) {
  const index = pendingApprovals.findIndex((a) => a.id === id);
  if (index >= 0) {
    const approval = pendingApprovals[index];
    pendingApprovals.splice(index, 1);

    const error = new Error(message);
    (error as any).code = 4001;
    approval.reject(error);

    // Process next approval if any
    if (approvalCallback && pendingApprovals.length > 0) {
      approvalCallback(pendingApprovals[0]);
    }
  }
}

/**
 * Request user approval for an action
 */
function requestApproval(
  type: PendingApproval["type"],
  request: ProviderRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const approval: PendingApproval = {
      id: request.id,
      type,
      request,
      resolve,
      reject,
    };

    pendingApprovals.push(approval);

    // If callback is set and this is the only pending approval, trigger it
    if (approvalCallback && pendingApprovals.length === 1) {
      approvalCallback(approval);
    }
  });
}

/**
 * Get the currently selected account address
 */
function getSelectedAddress(): string | null {
  const store = useWalletStore.getState();
  const account = store.accounts[store.selectedAccountIndex];
  return account?.address || null;
}

/**
 * Get the current chain ID
 */
function getChainId(): ChainId {
  return useWalletStore.getState().selectedChainId;
}

/**
 * Convert chain ID to hex string
 */
function chainIdToHex(chainId: number): string {
  return "0x" + chainId.toString(16);
}

/**
 * Handle provider request from DApp
 */
export async function handleProviderRequest(
  request: ProviderRequest,
): Promise<ProviderResponse> {
  const { id, method, params, host } = request;

  try {
    const result = await processMethod(method, params, request);
    return { id, result };
  } catch (error: any) {
    console.error(`[BrowserProvider] Error handling ${method}:`, error);
    return {
      id,
      error: {
        code: error.code || -32603,
        message: error.message || "Internal error",
      },
    };
  }
}

/**
 * Process individual RPC methods
 */
async function processMethod(
  method: string,
  params: unknown[],
  request: ProviderRequest,
): Promise<unknown> {
  const host = getDappHost(request.origin);
  const browserStore = useBrowserStore.getState();
  const session = browserStore.getSession(host);

  switch (method) {
    // === Connection Methods ===
    case "eth_requestAccounts": {
      // If already connected, return accounts
      if (session) {
        return [session.address];
      }

      // Request user approval
      const result = await requestApproval("connect", request);
      return result;
    }

    case "eth_accounts": {
      if (session) {
        return [session.address];
      }
      return [];
    }

    // === Chain Methods ===
    case "eth_chainId": {
      const chainId = session?.chainId || getChainId();
      return chainIdToHex(chainId);
    }

    case "net_version": {
      const chainId = session?.chainId || getChainId();
      return String(chainId);
    }

    case "wallet_switchEthereumChain": {
      const chainIdParam = (params[0] as { chainId: string })?.chainId;
      const chainId = parseInt(chainIdParam, 16);

      // Check if chain is supported
      const config = EthersClient.getNetworkConfig(chainId as ChainId);
      if (!config) {
        const error = new Error("Unrecognized chain ID");
        (error as any).code = 4902;
        throw error;
      }

      // Update session chain
      if (session) {
        browserStore.updateSessionChain(host, chainId as ChainId);
      }

      return null;
    }

    case "wallet_addEthereumChain": {
      // For now, just check if we support the chain
      const chainData = params[0] as { chainId: string };
      const chainId = parseInt(chainData.chainId, 16);

      const config = EthersClient.getNetworkConfig(chainId as ChainId);
      if (config) {
        // Chain already supported, just switch to it
        if (session) {
          browserStore.updateSessionChain(host, chainId as ChainId);
        }
        return null;
      }

      // Chain not supported
      const error = new Error("Chain not supported");
      (error as any).code = 4902;
      throw error;
    }

    // === Signing Methods ===
    case "personal_sign": {
      if (!session) {
        const error = new Error("Not connected");
        (error as any).code = 4100;
        throw error;
      }

      const result = await requestApproval("sign_message", request);
      return result;
    }

    case "eth_sign": {
      if (!session) {
        const error = new Error("Not connected");
        (error as any).code = 4100;
        throw error;
      }

      const result = await requestApproval("sign_message", request);
      return result;
    }

    case "eth_signTypedData":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4": {
      if (!session) {
        const error = new Error("Not connected");
        (error as any).code = 4100;
        throw error;
      }

      const result = await requestApproval("sign_typed_data", request);
      return result;
    }

    // === Transaction Methods ===
    case "eth_sendTransaction": {
      if (!session) {
        const error = new Error("Not connected");
        (error as any).code = 4100;
        throw error;
      }

      const result = await requestApproval("sign_transaction", request);
      return result;
    }

    case "eth_signTransaction": {
      if (!session) {
        const error = new Error("Not connected");
        (error as any).code = 4100;
        throw error;
      }

      const result = await requestApproval("sign_transaction", request);
      return result;
    }

    // === Read Methods (no approval needed) ===
    case "eth_blockNumber": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const blockNumber = await provider.getBlockNumber();
      return "0x" + blockNumber.toString(16);
    }

    case "eth_getBlockByNumber": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const block = await provider.getBlock(params[0] as string);
      return block;
    }

    case "eth_getBalance": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const balance = await provider.getBalance(params[0] as string);
      return "0x" + balance.toString(16);
    }

    case "eth_getCode": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const code = await provider.getCode(params[0] as string);
      return code;
    }

    case "eth_call": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const result = await provider.call(params[0] as any);
      return result;
    }

    case "eth_estimateGas": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const gas = await provider.estimateGas(params[0] as any);
      return "0x" + gas.toString(16);
    }

    case "eth_gasPrice": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const feeData = await provider.getFeeData();
      return "0x" + (feeData.gasPrice?.toString(16) || "0");
    }

    case "eth_getTransactionByHash": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const tx = await provider.getTransaction(params[0] as string);
      return tx;
    }

    case "eth_getTransactionReceipt": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const receipt = await provider.getTransactionReceipt(params[0] as string);
      return receipt;
    }

    case "eth_getTransactionCount": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const nonce = await provider.getTransactionCount(
        params[0] as string,
        (params[1] as string) || "latest",
      );
      return "0x" + nonce.toString(16);
    }

    case "eth_getLogs": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const logs = await provider.getLogs(params[0] as any);
      return logs;
    }

    case "eth_getStorageAt": {
      const chainId = session?.chainId || getChainId();
      const provider = EthersClient.getProvider(chainId);
      const storage = await provider.getStorage(
        params[0] as string,
        params[1] as string,
      );
      return storage;
    }

    // === Wallet Methods ===
    case "wallet_getPermissions": {
      if (session) {
        return [
          {
            parentCapability: "eth_accounts",
            caveats: [
              {
                type: "restrictReturnedAccounts",
                value: [session.address],
              },
            ],
          },
        ];
      }
      return [];
    }

    case "wallet_requestPermissions": {
      // Same as eth_requestAccounts for now
      if (session) {
        return [
          {
            parentCapability: "eth_accounts",
            caveats: [
              {
                type: "restrictReturnedAccounts",
                value: [session.address],
              },
            ],
          },
        ];
      }

      const result = await requestApproval("connect", request);
      if (result) {
        return [
          {
            parentCapability: "eth_accounts",
            caveats: [
              {
                type: "restrictReturnedAccounts",
                value: result,
              },
            ],
          },
        ];
      }
      return [];
    }

    case "personal_ecRecover": {
      // Recover address from signature
      const { verifyMessage } = await import("ethers");
      const message = params[0] as string;
      const signature = params[1] as string;
      const address = verifyMessage(message, signature);
      return address;
    }

    // === Unsupported Methods ===
    default: {
      console.warn(`[BrowserProvider] Unsupported method: ${method}`);
      const error = new Error(`Method ${method} not supported`);
      (error as any).code = 4200;
      throw error;
    }
  }
}

/**
 * Sign a message with the connected wallet
 */
export async function signMessage(
  address: string,
  message: string,
  chainId: ChainId,
): Promise<string> {
  const privateKey = await SecureStorage.loadPrivateKey(address);
  if (!privateKey) {
    throw new Error("Private key not found");
  }

  const wallet = EthersClient.createWallet(privateKey, chainId);

  // If message is hex-encoded, decode it first
  let messageToSign = message;
  if (message.startsWith("0x")) {
    try {
      const bytes = Buffer.from(message.slice(2), "hex");
      messageToSign = bytes.toString("utf8");
    } catch {
      // Keep as-is if decoding fails
    }
  }

  return await wallet.signMessage(messageToSign);
}

/**
 * Sign typed data (EIP-712)
 */
export async function signTypedData(
  address: string,
  typedData: any,
  chainId: ChainId,
): Promise<string> {
  const privateKey = await SecureStorage.loadPrivateKey(address);
  if (!privateKey) {
    throw new Error("Private key not found");
  }

  const wallet = EthersClient.createWallet(privateKey, chainId);

  // Parse typed data if it's a string
  const data =
    typeof typedData === "string" ? JSON.parse(typedData) : typedData;

  const { domain, types, message, primaryType } = data;

  // Remove EIP712Domain from types if present (ethers handles this)
  const filteredTypes = { ...types };
  delete filteredTypes.EIP712Domain;

  return await wallet.signTypedData(domain, filteredTypes, message);
}

/**
 * Send a transaction
 */
export async function sendTransaction(
  address: string,
  txParams: any,
  chainId: ChainId,
): Promise<string> {
  const privateKey = await SecureStorage.loadPrivateKey(address);
  if (!privateKey) {
    throw new Error("Private key not found");
  }

  const wallet = EthersClient.createWallet(privateKey, chainId);

  // Build transaction
  const tx: any = {
    to: txParams.to,
    value: txParams.value || "0x0",
    data: txParams.data || "0x",
  };

  // Add gas parameters if provided
  if (txParams.gas) {
    tx.gasLimit = txParams.gas;
  }
  if (txParams.gasPrice) {
    tx.gasPrice = txParams.gasPrice;
  }
  if (txParams.maxFeePerGas) {
    tx.maxFeePerGas = txParams.maxFeePerGas;
  }
  if (txParams.maxPriorityFeePerGas) {
    tx.maxPriorityFeePerGas = txParams.maxPriorityFeePerGas;
  }
  if (txParams.nonce !== undefined) {
    tx.nonce = txParams.nonce;
  }

  // Send transaction
  const response = await wallet.sendTransaction(tx);

  // Add to transaction history
  const store = useWalletStore.getState();
  store.addTransaction(address, {
    hash: response.hash,
    from: address,
    to: txParams.to,
    value: txParams.value || "0",
    chainId,
    timestamp: Date.now(),
    status: "pending",
    type: "send",
  });
  store.addPendingTransaction({
    hash: response.hash,
    from: address,
    to: txParams.to,
    value: txParams.value || "0",
    chainId,
    timestamp: Date.now(),
    status: "pending",
    type: "send",
  });

  return response.hash;
}
