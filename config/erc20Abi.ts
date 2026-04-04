/**
 * Standard ERC20 Token ABI
 * Includes all standard functions and events from EIP-20
 */
export const ERC20_STANDARD_ABI = [
  // ==================
  // VIEW FUNCTIONS
  // ==================

  // Returns the name of the token
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },

  // Returns the symbol of the token
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },

  // Returns the number of decimals used
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },

  // Returns the total token supply
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },

  // Returns the account balance of another account
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },

  // Returns the amount which spender is still allowed to withdraw from owner
  {
    constant: true,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },

  // ==================
  // STATE-CHANGING FUNCTIONS
  // ==================

  // Transfers tokens to a specified address
  {
    constant: false,
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },

  // Approve the passed address to spend the specified amount of tokens
  {
    constant: false,
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },

  // Transfer tokens from one address to another (requires approval)
  {
    constant: false,
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ==================
  // OPTIONAL FUNCTIONS (EIP-2612 Permit)
  // ==================

  // Returns the nonce for permit
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },

  // Returns the domain separator for permit
  {
    constant: true,
    inputs: [],
    name: "DOMAIN_SEPARATOR",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },

  // Permit - allows approval via signature (EIP-2612)
  {
    constant: false,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ==================
  // OPTIONAL FUNCTIONS (OpenZeppelin Extensions)
  // ==================

  // Atomically increases the allowance
  {
    constant: false,
    inputs: [
      { name: "spender", type: "address" },
      { name: "addedValue", type: "uint256" },
    ],
    name: "increaseAllowance",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },

  // Atomically decreases the allowance
  {
    constant: false,
    inputs: [
      { name: "spender", type: "address" },
      { name: "subtractedValue", type: "uint256" },
    ],
    name: "decreaseAllowance",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ==================
  // EVENTS
  // ==================

  // Transfer event
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },

  // Approval event
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Approval",
    type: "event",
  },
] as const;

/**
 * Minimal ERC20 ABI for common operations
 * Use this when you only need basic functionality
 */
export const ERC20_MINIMAL_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;

/**
 * ERC20 with Permit ABI (EIP-2612)
 * For tokens that support gasless approvals
 */
export const ERC20_PERMIT_ABI = [
  ...ERC20_MINIMAL_ABI,
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
] as const;

/**
 * Function selectors (first 4 bytes of keccak256 hash of function signature)
 */
export const ERC20_SELECTORS = {
  // View functions
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
  allowance: "0xdd62ed3e",

  // State-changing functions
  transfer: "0xa9059cbb",
  approve: "0x095ea7b3",
  transferFrom: "0x23b872dd",

  // Optional functions
  increaseAllowance: "0x39509351",
  decreaseAllowance: "0xa457c2d7",
  permit: "0xd505accf",
  nonces: "0x7ecebe00",
  DOMAIN_SEPARATOR: "0x3644e515",
} as const;

/**
 * Maximum uint256 for unlimited approvals
 */
export const MAX_UINT256 = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);

/**
 * Common approval amounts
 */
export const APPROVAL_PRESETS = {
  ZERO: 0n,
  UNLIMITED: MAX_UINT256,
  ONE_MILLION: BigInt(1_000_000) * BigInt(10 ** 18), // 1M tokens (18 decimals)
  TEN_MILLION: BigInt(10_000_000) * BigInt(10 ** 18),
  ONE_BILLION: BigInt(1_000_000_000) * BigInt(10 ** 18),
} as const;

/**
 * Helper to decode ERC20 transfer data
 */
export function decodeTransferData(data: string): {
  to: string;
  amount: bigint;
} | null {
  if (!data.startsWith(ERC20_SELECTORS.transfer)) {
    return null;
  }

  const params = data.slice(10); // Remove selector
  const to = "0x" + params.slice(24, 64);
  const amount = BigInt("0x" + params.slice(64, 128));

  return { to, amount };
}

/**
 * Helper to decode ERC20 approve data
 */
export function decodeApproveData(data: string): {
  spender: string;
  amount: bigint;
} | null {
  if (!data.startsWith(ERC20_SELECTORS.approve)) {
    return null;
  }

  const params = data.slice(10);
  const spender = "0x" + params.slice(24, 64);
  const amount = BigInt("0x" + params.slice(64, 128));

  return { spender, amount };
}

/**
 * Helper to decode ERC20 transferFrom data
 */
export function decodeTransferFromData(data: string): {
  from: string;
  to: string;
  amount: bigint;
} | null {
  if (!data.startsWith(ERC20_SELECTORS.transferFrom)) {
    return null;
  }

  const params = data.slice(10);
  const from = "0x" + params.slice(24, 64);
  const to = "0x" + params.slice(88, 128);
  const amount = BigInt("0x" + params.slice(128, 192));

  return { from, to, amount };
}

/**
 * Check if transaction data is an ERC20 operation
 */
export function getERC20OperationType(
  data: string,
):
  | "transfer"
  | "approve"
  | "transferFrom"
  | "increaseAllowance"
  | "decreaseAllowance"
  | "permit"
  | "unknown" {
  if (!data || data.length < 10) return "unknown";

  const selector = data.slice(0, 10).toLowerCase();

  switch (selector) {
    case ERC20_SELECTORS.transfer:
      return "transfer";
    case ERC20_SELECTORS.approve:
      return "approve";
    case ERC20_SELECTORS.transferFrom:
      return "transferFrom";
    case ERC20_SELECTORS.increaseAllowance:
      return "increaseAllowance";
    case ERC20_SELECTORS.decreaseAllowance:
      return "decreaseAllowance";
    case ERC20_SELECTORS.permit:
      return "permit";
    default:
      return "unknown";
  }
}

export default {
  ERC20_STANDARD_ABI,
  ERC20_MINIMAL_ABI,
  ERC20_PERMIT_ABI,
  ERC20_SELECTORS,
  MAX_UINT256,
  APPROVAL_PRESETS,
  decodeTransferData,
  decodeApproveData,
  decodeTransferFromData,
  getERC20OperationType,
};
