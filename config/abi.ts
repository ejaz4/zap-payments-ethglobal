export const globalContractABI = [
  {
    inputs: [],
    name: "cancelActiveTransaction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "clearActiveTransaction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_owner",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "tokenContract",
        type: "address",
      },
    ],
    name: "FundsWithdrawn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "description",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "merchantName",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "merchantLocation",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "itemizedList",
        type: "string",
      },
      {
        indexed: false,
        internalType: "address",
        name: "requestedTokenContract",
        type: "address",
      },
    ],
    name: "NewActiveTransaction",
    type: "event",
  },
  {
    inputs: [],
    name: "payActiveTransaction",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "tokenContract",
        type: "address",
      },
    ],
    name: "PaymentReceived",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "description",
        type: "string",
      },
      {
        internalType: "string",
        name: "merchantName",
        type: "string",
      },
      {
        internalType: "string",
        name: "merchantLocation",
        type: "string",
      },
      {
        internalType: "string",
        name: "itemizedList",
        type: "string",
      },
      {
        internalType: "address",
        name: "requestedTokenContract",
        type: "address",
      },
    ],
    name: "setActiveTransaction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "TransactionCancelled",
    type: "event",
  },
  {
    stateMutability: "payable",
    type: "fallback",
  },
  {
    inputs: [
      {
        internalType: "address payable",
        name: "to",
        type: "address",
      },
      {
        internalType: "address",
        name: "tokenContract",
        type: "address",
      },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
  {
    inputs: [],
    name: "activeTransaction",
    outputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        internalType: "bool",
        name: "paid",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "description",
        type: "string",
      },
      {
        internalType: "bool",
        name: "cancelled",
        type: "bool",
      },
      {
        internalType: "string",
        name: "merchantName",
        type: "string",
      },
      {
        internalType: "string",
        name: "merchantLocation",
        type: "string",
      },
      {
        internalType: "string",
        name: "itemizedList",
        type: "string",
      },
      {
        internalType: "address",
        name: "requestedTokenContract",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getActiveTransactionFields",
    outputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        internalType: "bool",
        name: "paid",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "description",
        type: "string",
      },
      {
        internalType: "bool",
        name: "cancelled",
        type: "bool",
      },
      {
        internalType: "string",
        name: "merchantName",
        type: "string",
      },
      {
        internalType: "string",
        name: "merchantLocation",
        type: "string",
      },
      {
        internalType: "string",
        name: "itemizedList",
        type: "string",
      },
      {
        internalType: "address",
        name: "requestedTokenContract",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllRecentTransactions",
    outputs: [
      {
        internalType: "uint256[]",
        name: "ids",
        type: "uint256[]",
      },
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
      {
        internalType: "address[]",
        name: "payers",
        type: "address[]",
      },
      {
        internalType: "bool[]",
        name: "paids",
        type: "bool[]",
      },
      {
        internalType: "uint256[]",
        name: "timestamps",
        type: "uint256[]",
      },
      {
        internalType: "string[]",
        name: "descriptions",
        type: "string[]",
      },
      {
        internalType: "bool[]",
        name: "cancelleds",
        type: "bool[]",
      },
      {
        internalType: "string[]",
        name: "merchantNames",
        type: "string[]",
      },
      {
        internalType: "string[]",
        name: "merchantLocations",
        type: "string[]",
      },
      {
        internalType: "string[]",
        name: "itemizedLists",
        type: "string[]",
      },
      {
        internalType: "address[]",
        name: "requestedTokenContracts",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "tokenContract",
        type: "address",
      },
    ],
    name: "getContractBalance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPaymentStatus",
    outputs: [
      {
        internalType: "bool",
        name: "paid",
        type: "bool",
      },
      {
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        internalType: "bool",
        name: "cancelled",
        type: "bool",
      },
      {
        internalType: "address",
        name: "requestedTokenContract",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
    ],
    name: "getRecentTransactionFields",
    outputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        internalType: "bool",
        name: "paid",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "description",
        type: "string",
      },
      {
        internalType: "bool",
        name: "cancelled",
        type: "bool",
      },
      {
        internalType: "string",
        name: "merchantName",
        type: "string",
      },
      {
        internalType: "string",
        name: "merchantLocation",
        type: "string",
      },
      {
        internalType: "string",
        name: "itemizedList",
        type: "string",
      },
      {
        internalType: "address",
        name: "requestedTokenContract",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRecentTransactionsCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_RECENT_TX",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "recentTransactions",
    outputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "payer",
        type: "address",
      },
      {
        internalType: "bool",
        name: "paid",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "description",
        type: "string",
      },
      {
        internalType: "bool",
        name: "cancelled",
        type: "bool",
      },
      {
        internalType: "string",
        name: "merchantName",
        type: "string",
      },
      {
        internalType: "string",
        name: "merchantLocation",
        type: "string",
      },
      {
        internalType: "string",
        name: "itemizedList",
        type: "string",
      },
      {
        internalType: "address",
        name: "requestedTokenContract",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "txCounter",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
