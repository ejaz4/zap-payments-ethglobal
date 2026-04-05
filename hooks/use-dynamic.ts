/**
 * useDynamic — reactive hook for the Dynamic client state.
 *
 * Wraps the shared dynamicClient in useReactiveClient so that component
 * re-renders are triggered automatically when wallets, auth, or other
 * client state changes.
 *
 * Usage:
 *   const { wallets, auth } = useDynamic();
 *   const primaryWallet = wallets.primary;
 *   const isAuthenticated = !!auth.authenticatedUser;
 */

import { useReactiveClient } from "@dynamic-labs/react-hooks";
import { dynamicClient } from "@/crypto/dynamic/client";

export const useDynamic = () => useReactiveClient(dynamicClient);
