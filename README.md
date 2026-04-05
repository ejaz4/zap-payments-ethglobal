# Zap Wallet ⚡️
**The first self-custodial, NFC tap-to-pay wallet for the real world.**

Stop fumbling with QR codes. Zap Wallet turns your crypto into a real-world payment method that feels exactly like Apple Pay—but stays 100% self-custodial. Built at **ETHGlobal Cannes 2026**.

---

## 📱 The Problem
Current crypto wallets are built for spreadsheets and swaps, not for the checkout line. 
* **The "QR Scuffle":** Scanning codes is slow, awkward, and prone to failure.
* **Token Mismatch:** You shouldn't have to manually swap to USDC just to buy a coffee.
* **UX Friction:** Seed phrases and manual confirmations kill the "everyday" flow.

## ✨ Our Vision
We have a borderline obsession with usability. If the UX stutters, we failed. Zap Wallet makes the blockchain invisible by combining hardware-level NFC interaction with automated liquidity routing. **Tap, sign, done.**

---

## 🛠️ How It’s Made
Zap Wallet is a high-performance **React Native** mobile app backed by a **Custom Services API** for rapid orchestration.

### The Stack
* **NFC / Host Card Emulation (HCE):** We built a custom native module to bridge the phone's NFC chip with self-custodial signing logic.
* **Dynamic:** Our onboarding engine. It provides a Web2-style login (Passkeys/Social) with a Web3 soul, creating an embedded wallet without the seed phrase headache.
* **Uniswap Universal Router:** Powers our background "Swap-to-Pay." It automatically routes whatever asset you hold into the merchant’s required token in a single atomic transaction.
* **ENS:** Replaces messy hex strings with human names, making every transaction feel familiar and secure.
* **EVM Optimized:** Built to leverage high-speed L2s for near-zero fees and instant settlement.

### The "Hacky" Bit
To hit Apple Pay speeds, we bypassed the standard "wait-and-see" transaction lifecycle. We implemented a **Private RPC Relayer** that broadcasts the signed payload the millisecond the NFC handshake is completed. By the time you pull your phone away, the transaction is already being indexed.

---

## 📂 Repositories
* **[Primary Monorepo](https://github.com/ejaz4/zap-payments-ethglobal):** React Native mobile app and core smart contract logic.
* **[Zap API](https://github.com/bonusducks777/zap-api-cannes):** Custom orchestration layer for rapid routing and gas estimation.

---

## 👥 Meet the Team
* **Soumil Sahjpall** – AI, Web3 & Robotics Founder
* **Ejaz Ali** – AI & Platform Infrastructure Dev
* **Tiffanie Cheng** – UI/UX Design & Copywriting

---
*Built with ❤️ at ETHGlobal Cannes 2026.*