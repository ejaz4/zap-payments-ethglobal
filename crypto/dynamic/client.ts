/**
 * Dynamic React Native SDK client — singleton instance.
 *
 * Initialises the Dynamic client with:
 *  - ReactNativeExtension (required for RN WebView + auth flows)
 *  - SolanaExtension     (SVM chain support: Connection + Signer)
 *
 * The environment ID is pulled from EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID.
 */

import { createClient } from "@dynamic-labs/client";
import { ReactNativeExtension } from "@dynamic-labs/react-native-extension";
import { SolanaExtension } from "@dynamic-labs/solana-extension";

const ENVIRONMENT_ID =
  (process.env["EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID"] as string | undefined) ??
  "";

if (!ENVIRONMENT_ID) {
  console.warn(
    "[DynamicClient] EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set. " +
      "Dynamic wallet features will not work until you set it in .env.",
  );
}

/**
 * The shared Dynamic client instance used throughout the app.
 *
 * Usage:
 *   import { dynamicClient } from "@/crypto/dynamic/client";
 *
 *   // Reactive in components:
 *   const { wallets, auth } = useReactiveClient(dynamicClient);
 *
 *   // Imperative:
 *   dynamicClient.auth.login();
 *   dynamicClient.solana.getConnection();
 */
const APP_ORIGIN =
  (process.env["EXPO_PUBLIC_DYNAMIC_APP_ORIGIN"] as string | undefined) ??
  "http://localhost:8081";

export const dynamicClient = createClient({
  environmentId: ENVIRONMENT_ID,
  appName: "Zap Payments",
})
  .extend(ReactNativeExtension({ appOrigin: APP_ORIGIN }))
  .extend(SolanaExtension());
