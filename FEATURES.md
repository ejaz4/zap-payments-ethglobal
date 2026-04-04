# Zap Wallet Features (Rainbow Parity via ethers.js + RPC)

This document lists all Rainbow wallet features that can be replicated using only ethers.js and standard RPC calls (no proprietary APIs).

## ✅ Implemented

### Core Wallet

- [x] HD wallet creation from BIP39 mnemonic
- [x] Wallet import from mnemonic phrase
- [x] Wallet import from private key
- [x] Multi-account support (HD derivation path: m/44'/60'/0'/0/x)
- [x] Imported accounts (private key) alongside HD accounts
- [x] Secure storage of mnemonic and private keys (expo-secure-store)
- [x] Account naming/renaming
- [x] Account switching

### Network Support

- [x] Multi-chain support (Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche, BSC, Zora, Sepolia)
- [x] Network/chain switching with provider cache management
- [x] Network badge indicator
- [x] Per-network RPC configuration
- [x] Custom RPC URL support per network
- [x] Network enable/disable
- [x] Favorite networks (pinned to top)
- [x] Network settings screen

### Balances

- [x] Native token balance fetching
- [x] ERC20 token balance fetching
- [x] Token list per network
- [x] Balance formatting
- [x] Pull-to-refresh balance updates

### Transactions

- [x] Send native tokens (ETH, MATIC, etc.)
- [x] Send ERC20 tokens
- [x] Transaction status tracking (pending/confirmed/failed)
- [x] Pending transaction list
- [x] Transaction history persistence
- [x] Transaction details screen (tap to view)
- [x] View transaction in block explorer
- [x] Gas estimation
- [x] Gas estimation with padding (safety buffer)
- [x] EIP-1559 gas parameters (maxFeePerGas, maxPriorityFeePerGas)
- [x] Legacy gas price support
- [x] Gas speed settings (slow/normal/fast)
- [x] Custom gas limits per transaction type
- [x] Gas settings panel

### ENS (Ethereum Name Service)

- [x] ENS name resolution (name → address)
- [x] ENS reverse lookup (address → name)
- [x] Send to ENS names

### Signing

- [x] Personal message signing (personal_sign)
- [x] Typed data signing (EIP-712 signTypedData)

### UI/UX

- [x] Dark theme
- [x] SafeAreaProvider for proper screen insets
- [x] Onboarding flow (welcome, create, import)
- [x] Tab navigation (Home, Activity, Settings)
- [x] Pull-to-refresh balance updates
- [x] Address copy to clipboard
- [x] Receive screen with address display

---

## 📋 To Implement (Nice to Have)

### Wallet Management

- [ ] Watch-only wallets (import address only, no private key)
- [ ] Delete/hide accounts
- [ ] Account reordering
- [ ] Account avatars/colors (local only)

### Transactions (Advanced)

- [x] Gas price options (slow/normal/fast)
- [x] Custom gas limit input
- [ ] Nonce management
- [ ] Speed up transaction (replace with higher gas)
- [ ] Cancel transaction (replace with 0-value self-transfer)

### Token Management

- [ ] Add custom tokens
- [ ] Hide tokens
- [ ] Token search/filter

### Security

- [ ] Biometric unlock (Face ID / Fingerprint)
- [ ] PIN/passcode lock
- [ ] Auto-lock timeout
- [ ] Seed phrase backup reminder

### Address Book

- [ ] Save contacts with name + address
- [ ] Recent addresses

### QR Codes

- [ ] Scan QR to get address
- [ ] Show QR code for receive

---

## ❌ Not Possible (Requires External APIs)

These features require external services beyond standard RPC:

- Real-time token prices
- Historical price charts
- Fiat on-ramp/off-ramp
- Token discovery/trending tokens
- NFT display and metadata
- Push notifications for transactions
- DEX/Swap aggregation
- Bridge functionality
- Gas price oracle/estimation API
- Token logo images (unless bundled)
- Transaction indexing/history API
- WalletConnect (requires WC relay server)

---

## Architecture Notes

### Provider Caching

```typescript
// Providers are cached per chainId to avoid recreating connections
EthersClient.getProvider(ChainId.mainnet); // Creates and caches
EthersClient.getProvider(ChainId.mainnet); // Returns cached
EthersClient.clearProviderCache(); // Clear on RPC change
```

### Multi-Account HD Derivation

```typescript
// All accounts derive from same mnemonic with different indices
// m/44'/60'/0'/0/0 → Account 1
// m/44'/60'/0'/0/1 → Account 2
// m/44'/60'/0'/0/2 → Account 3
```

### State Management

- Zustand for reactive state
- AsyncStorage for persistence
- SecureStorage for sensitive data (mnemonic, private keys)
