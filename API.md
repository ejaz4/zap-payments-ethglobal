# ZAP Payments Cannes API: Complete Implementation Description and Schema

This document is the single-source integration guide for implementing a client against this API.
It describes:
- Supported networks
- Unified request and response contracts
- Route-by-route schemas
- Network-specific behavior differences
- Error and failure semantics

Use this together with runtime discovery from GET /v1/networks.

## 1. Base API

- Base URL (local): http://127.0.0.1:3001
- Health route: GET /health
- Main namespace: /v1/*
- Content type for POST: application/json

## 2. Response Envelope (Global)

All routes return a unified envelope.

### 2.1 Success envelope

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO-8601 UTC"
  }
}
```

### 2.2 Error envelope

```json
{
  "ok": false,
  "error": {
    "code": "HTTP_ERROR",
    "message": "error text",
    "details": null
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO-8601 UTC"
  }
}
```

Notes:
- `requestId` is also returned in response header `X-Request-Id`.
- Some operational failures (for example transfer runtime failures) are normalized as success-envelope payloads with `data.status = "failed"` instead of throwing an HTTP error.

## 3. Supported Networks

Discover dynamically at runtime via GET /v1/networks.

Current registry values:

- EVM:
  - eth-mainnet
  - eth-sepolia
- Hedera:
  - hedera-mainnet
  - hedera-testnet
- Dynamic SVM:
  - dynamic-mainnet (Solana mainnet)
  - dynamic-testnet (Solana devnet)
- Arc:
  - arc-mainnet
  - arc-testnet

## 4. Unified Request Models

### 4.1 Create keypair

POST /v1/wallets:keypair

```json
{
  "networkId": "string",
  "curve": "secp256k1"
}
```

### 4.2 Import private key

POST /v1/wallets:import-private-key

```json
{
  "networkId": "string",
  "privateKey": "string",
  "format": "auto"
}
```

### 4.3 Derive address

POST /v1/wallets:derive-address

```json
{
  "networkId": "string",
  "privateKey": "string"
}
```

### 4.4 Import mnemonic

POST /v1/wallets:import-mnemonic

```json
{
  "networkId": "string",
  "mnemonic": "string",
  "derivationPath": "m/44'/60'/0'/0/0",
  "passphrase": "optional-string"
}
```

### 4.5 Build transfer

POST /v1/transfers:build

```json
{
  "networkId": "string",
  "from_address": "string",
  "to_address": "string",
  "amount": "decimal-string",
  "tokenRef": "optional-string",
  "memo": "optional-string",
  "feePreference": "normal"
}
```

### 4.6 Sign transfer

POST /v1/transfers:sign

```json
{
  "networkId": "string",
  "unsignedTx": {},
  "privateKey": "string"
}
```

### 4.7 Broadcast transfer

POST /v1/transfers:broadcast

```json
{
  "networkId": "string",
  "signedTx": "string"
}
```

### 4.8 Send transfer (one-shot)

POST /v1/transfers:send

```json
{
  "networkId": "string",
  "from_address": "string",
  "to_address": "string",
  "amount": "decimal-string",
  "privateKey": "string",
  "tokenRef": "optional-string",
  "memo": "optional-string"
}
```

## 5. Route Catalog and Response Schemas

## 5.1 Health and network discovery

1. GET /health
- Returns: `{ data: { ok: true } }`

2. GET /v1/networks
- Returns: list of network metadata and capability flags.

3. GET /v1/networks/{networkId}
- Returns: single network metadata object.

Network metadata shape:

```json
{
  "networkId": "string",
  "family": "evm|hbar|dynamic|arc",
  "chainId": "string",
  "displayName": "string",
  "symbol": "string",
  "decimals": 0,
  "isTestnet": true,
  "rpc": {
    "publicRpcUrls": ["string"],
    "explorerTxBaseUrl": "string"
  },
  "capabilities": {
    "createKeypair": true,
    "importPrivateKey": true,
    "importMnemonic": false,
    "supportsNativeTransfers": true,
    "supportsTokenTransfers": true,
    "supportsContracts": false,
    "supportsTransactionSimulation": false,
    "supportsHistory": true,
    "supportsNameService": false,
    "supportsTrustLines": false,
    "supportsChecks": false
  }
}
```

## 5.2 Wallets

1. POST /v1/wallets:keypair
- Returns:

```json
{
  "address": "string",
  "publicKey": "string",
  "privateKey": "string",
  "mnemonic": null
}
```

2. POST /v1/wallets:import-private-key
- Returns:

```json
{
  "address": "string",
  "publicKey": "string"
}
```

3. POST /v1/wallets:derive-address
- Returns:

```json
{
  "address": "string"
}
```

4. POST /v1/wallets:import-mnemonic
- Current behavior is network-dependent.
- For unsupported paths it returns a capability payload instead of 501:

```json
{
  "networkId": "string",
  "supported": false,
  "reason": "string"
}
```

## 5.3 Balances and assets

1. GET /v1/balances/native?networkId=...&address=...

```json
{
  "networkId": "string",
  "address": "string",
  "amount": "decimal-string",
  "amountAtomic": "integer-string",
  "decimals": 0,
  "symbol": "string"
}
```

2. GET /v1/balances/token?networkId=...&address=...&tokenRef=...

```json
{
  "networkId": "string",
  "address": "string",
  "amount": "decimal-string",
  "amountAtomic": "integer-string",
  "decimals": 0,
  "symbol": "string",
  "tokenRef": "string"
}
```

3. GET /v1/balances/tokens?networkId=...&address=...&includeZero=true&tokenListId=stablecoins-default

```json
{
  "networkId": "string",
  "address": "string",
  "tokenList": "string",
  "balances": [
    {
      "symbol": "string",
      "name": "string",
      "amount": "decimal-string",
      "amountAtomic": "integer-string",
      "decimals": 0,
      "address": "string",
      "logoUrl": "optional-string",
      "isStablecoin": true
    }
  ]
}
```

4. GET /v1/assets/tokens?networkId=...&category=optional

```json
{
  "networkId": "string",
  "tokens": [
    {
      "symbol": "string",
      "name": "string",
      "decimals": 0,
      "address": "string",
      "logoUrl": "optional-string",
      "category": "optional-string",
      "isStablecoin": true
    }
  ],
  "count": 0
}
```

## 5.4 Transfers

1. POST /v1/transfers:build

```json
{
  "unsignedTx": {},
  "networkId": "string"
}
```

2. POST /v1/transfers:sign

```json
{
  "signedTx": "string",
  "networkId": "string"
}
```

3. POST /v1/transfers:broadcast

Success-submission shape:

```json
{
  "txHash": "string",
  "status": "submitted",
  "networkId": "string"
}
```

Runtime failure shape (normalized, still in success envelope):

```json
{
  "txHash": null,
  "status": "failed",
  "networkId": "string",
  "error": "string"
}
```

4. POST /v1/transfers:send

Success-submission shape:

```json
{
  "txHash": "string",
  "status": "submitted"
}
```

Runtime failure shape (normalized):

```json
{
  "txHash": null,
  "status": "failed",
  "networkId": "string",
  "error": "string"
}
```

## 5.5 Transactions

1. GET /v1/transactions/{txHash}?networkId=...

```json
{
  "txHash": "string",
  "status": "submitted|pending|confirmed|failed|dropped",
  "blockNumber": 0,
  "gasUsed": "optional-string",
  "from": "optional-string",
  "to": "optional-string",
  "value": "optional-string"
}
```

2. GET /v1/transactions:history?networkId=...&address=...&limit=50&cursor=optional

```json
{
  "networkId": "string",
  "address": "string",
  "transactions": [
    {
      "txHash": "string",
      "type": "string",
      "from": "string",
      "to": "string",
      "amount": "string",
      "symbol": "string",
      "timestamp": 0,
      "status": "string",
      "explorerUrl": "optional-string",
      "tokenRef": "optional-string"
    }
  ]
}
```

## 5.6 Names

1. GET /v1/names:resolve?networkId=...&name=...

```json
{
  "name": "string",
  "address": "string-or-null",
  "networkId": "string",
  "supported": true
}
```

2. GET /v1/names:lookup?networkId=...&address=...

```json
{
  "address": "string",
  "name": "string-or-null",
  "networkId": "string",
  "supported": true
}
```

3. GET /v1/names:profile?networkId=...&name=...

```json
{
  "networkId": "string",
  "name": "string",
  "resolvedAddress": "string-or-null",
  "profile": {
    "displayName": "string",
    "avatar": null,
    "description": null,
    "links": []
  },
  "supported": false
}
```

## 5.7 Contracts, trust-lines, checks, custom operations

These routes are implemented as explicit placeholder-style responses (not hard 501):

1. POST /v1/contracts:invoke

```json
{
  "networkId": "string",
  "supported": false,
  "status": "not_applicable",
  "reason": "string",
  "hint": {
    "operationRoute": "/v1/networks/<networkId>/operations/<operationId>"
  }
}
```

2. GET /v1/trust-lines
3. POST /v1/trust-lines:set
4. POST /v1/checks:create
5. POST /v1/checks:cash

All return:

```json
{
  "networkId": "string",
  "supported": false,
  "status": "not_applicable",
  "reason": "string"
}
```

6. POST /v1/networks/{networkId}/operations/{operationId}

```json
{
  "networkId": "string",
  "operationId": "string",
  "accepted": true,
  "result": {
    "echo": {},
    "note": "No concrete operation handler registered yet; request accepted for extension workflow"
  }
}
```

## 6. Network-Specific Notes

### 6.1 EVM (eth-mainnet, eth-sepolia)

- Addresses are EIP-55 checksummed.
- Native symbol is ETH.
- Name routes may return supported true for ENS-capable paths.
- RPC rate limits can affect real-time results; provider returns safe fallback values for some balance lookups.
- Transfer broadcast/send can return `status = failed` with chain-level error text (for example nonce or funds issues).

### 6.2 Hedera (hedera-mainnet, hedera-testnet)

- Uses Hedera wrapper bridge.
- Native asset is HBAR (8 decimals).
- Wallet create/import/derive currently use key material where account ID assignment may be external to key generation.
- Core wallet routes and balances/history operate on both testnet and mainnet.

### 6.3 Dynamic SVM (dynamic-mainnet, dynamic-testnet)

- Represents Solana-backed Dynamic wallet flow.
- Native symbol is SOL (9 decimals).
- Dynamic SDK mode requires environment credentials.
- On Windows, fallback mode can be enabled for compatibility.

### 6.4 Arc (arc-mainnet, arc-testnet)

- EVM-like provider behavior.
- Arc testnet chainId is 5042002.

## 7. Environment Variables for Production-Like Use

Dynamic SVM:
- DYNAMIC_ENVIRONMENT_ID
- DYNAMIC_AUTH_TOKEN
- WALLET_PASSWORD (recommended)
- DYNAMIC_SVM_SOFTWARE_FALLBACK (Windows compatibility)
- SOLANA_DEVNET_RPC_URL (optional override)
- SOLANA_MAINNET_RPC_URL (optional override)

Hedera:
- HEDERA_NETWORK
- HEDERA_OPERATOR_ID
- HEDERA_OPERATOR_KEY

General:
- API_HOST
- API_PORT
- LOG_LEVEL

## 8. Integration Flows

### 8.1 Create wallet and check native balance

1. POST /v1/wallets:keypair
2. GET /v1/balances/native

### 8.2 Import wallet and fetch token balances

1. POST /v1/wallets:import-private-key
2. GET /v1/assets/tokens
3. GET /v1/balances/token or GET /v1/balances/tokens

### 8.3 Transfer flow

1. POST /v1/transfers:build
2. POST /v1/transfers:sign
3. POST /v1/transfers:broadcast

Alternative one-shot:
1. POST /v1/transfers:send

Interpretation rule:
- If HTTP 200 and `data.status = submitted`, transaction was accepted for chain submission.
- If HTTP 200 and `data.status = failed`, treat as runtime chain failure (insufficient funds, nonce, simulation, RPC constraints).

## 9. Client Implementation Checklist

1. Always call GET /v1/networks at startup and cache capabilities by networkId.
2. Use networkId as the only chain selector in every call.
3. Treat amount and amountAtomic as strings to avoid precision loss.
4. Support both hard error envelope (`ok = false`) and soft runtime transfer failure (`ok = true`, `status = failed`).
5. For non-applicable routes, check `supported` and `status` fields in payload.
6. Keep private keys client-side whenever possible; only send to signing routes when needed.

This schema is sufficient to build a full client integration against all currently supported networks and route behaviors.
