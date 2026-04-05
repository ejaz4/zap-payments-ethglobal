import { ApiProvider } from "@/crypto/provider/api";
import type { TxStatus } from "@/crypto/types";
import { useProviderStore } from "@/store/provider";
import { useWalletStore } from "@/store/wallet";
import { BalanceService } from "@/services/wallet";
import { useEffect, useRef } from "react";

const TERMINAL_SUCCESS = new Set<TxStatus>(["confirmed"]);
const TERMINAL_FAILURE = new Set<TxStatus>(["failed", "dropped"]);
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

interface PendingPoll {
  txHash: string;
  networkId: string;
  startedAt: number;
}

/**
 * Polls the Dynamic API for transaction status on any pending Solana transactions.
 * Automatically updates the wallet store when a tx reaches a terminal state.
 *
 * Mount this once near the app root (e.g. in _layout or the home tab).
 */
export function useTxStatusPoller() {
  const pendingTransactions = useWalletStore((s) => s.pendingTransactions);
  const activePolls = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const apiBaseUrl = useProviderStore.getState().getApiBaseUrl();
    if (!apiBaseUrl) return;

    const store = useWalletStore.getState();
    let provider: ApiProvider;
    try {
      provider = new ApiProvider(apiBaseUrl);
    } catch {
      return;
    }

    // Find pending Solana txs that aren't already being polled
    const solanaPending = pendingTransactions.filter(
      (tx) =>
        tx.status === "pending" &&
        tx.hash.length > 0 &&
        !activePolls.current.has(tx.hash),
    );

    for (const tx of solanaPending) {
      // Determine networkId from the account that sent this tx
      const account = store.accounts.find(
        (a) => a.address === tx.from && (a.accountType === "solana" || a.accountType === "dynamic"),
      );
      if (!account) continue;

      const networkId =
        account.networkId ??
        useProviderStore.getState().selectedApiNetworkId ??
        "dynamic-testnet";

      const poll: PendingPoll = {
        txHash: tx.hash,
        networkId,
        startedAt: Date.now(),
      };

      const tick = () => {
        // Timeout — stop polling
        if (Date.now() - poll.startedAt > POLL_TIMEOUT_MS) {
          activePolls.current.delete(poll.txHash);
          return;
        }

        provider
          .getTransaction(poll.txHash, poll.networkId)
          .then((details) => {
            const status = details?.status ?? "pending";

            if (TERMINAL_SUCCESS.has(status)) {
              useWalletStore.getState().updateTransactionStatus(poll.txHash, "confirmed");
              useWalletStore.getState().removePendingTransaction(poll.txHash);
              activePolls.current.delete(poll.txHash);
              BalanceService.forceRefreshBalances();
            } else if (TERMINAL_FAILURE.has(status)) {
              useWalletStore.getState().updateTransactionStatus(poll.txHash, "failed");
              useWalletStore.getState().removePendingTransaction(poll.txHash);
              activePolls.current.delete(poll.txHash);
            } else {
              // Still pending — schedule next poll
              const timerId = setTimeout(tick, POLL_INTERVAL_MS);
              activePolls.current.set(poll.txHash, timerId);
            }
          })
          .catch((err) => {
            // Transient API error — keep polling until timeout
            console.warn("[TxStatusPoller] poll error:", err);
            const timerId = setTimeout(tick, POLL_INTERVAL_MS);
            activePolls.current.set(poll.txHash, timerId);
          });
      };

      // Start first poll immediately
      const timerId = setTimeout(tick, 0);
      activePolls.current.set(tx.hash, timerId);
    }

    // Cleanup polls for txs that are no longer pending (e.g. removed externally)
    const pendingHashes = new Set(pendingTransactions.map((tx) => tx.hash));
    for (const [hash, timerId] of activePolls.current) {
      if (!pendingHashes.has(hash)) {
        clearTimeout(timerId);
        activePolls.current.delete(hash);
      }
    }
  }, [pendingTransactions]);

  // Cleanup all polls on unmount
  useEffect(() => {
    const polls = activePolls.current;
    return () => {
      for (const timerId of polls.values()) {
        clearTimeout(timerId);
      }
      polls.clear();
    };
  }, []);
}
