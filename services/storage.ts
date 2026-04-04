import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Storage keys
 */
const KEYS = {
  MNEMONIC: "zap_wallet_mnemonic",
  PRIVATE_KEY_PREFIX: "zap_wallet_pk_",
  WALLET_INITIALIZED: "zap_wallet_initialized",
  SELECTED_ACCOUNT: "zap_wallet_selected_account",
} as const;

/**
 * Secure storage options
 */
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * SecureStorage - Handles secure storage of sensitive data
 * Based on Rainbow's keychain patterns but using expo-secure-store
 */
export class SecureStorage {
  /**
   * Save mnemonic phrase securely
   */
  static async saveMnemonic(mnemonic: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(
        KEYS.MNEMONIC,
        mnemonic,
        secureStoreOptions,
      );
      return true;
    } catch (error) {
      console.error("[SecureStorage]: Failed to save mnemonic", error);
      return false;
    }
  }

  /**
   * Load mnemonic phrase
   */
  static async loadMnemonic(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.MNEMONIC, secureStoreOptions);
    } catch (error) {
      console.error("[SecureStorage]: Failed to load mnemonic", error);
      return null;
    }
  }

  /**
   * Delete mnemonic phrase
   */
  static async deleteMnemonic(): Promise<boolean> {
    try {
      await SecureStore.deleteItemAsync(KEYS.MNEMONIC, secureStoreOptions);
      return true;
    } catch (error) {
      console.error("[SecureStorage]: Failed to delete mnemonic", error);
      return false;
    }
  }

  /**
   * Save private key for an address
   */
  static async savePrivateKey(
    address: string,
    privateKey: string,
  ): Promise<boolean> {
    try {
      const key = `${KEYS.PRIVATE_KEY_PREFIX}${address.toLowerCase()}`;
      await SecureStore.setItemAsync(key, privateKey, secureStoreOptions);
      return true;
    } catch (error) {
      console.error("[SecureStorage]: Failed to save private key", error);
      return false;
    }
  }

  /**
   * Load private key for an address
   */
  static async loadPrivateKey(address: string): Promise<string | null> {
    try {
      const key = `${KEYS.PRIVATE_KEY_PREFIX}${address.toLowerCase()}`;
      return await SecureStore.getItemAsync(key, secureStoreOptions);
    } catch (error) {
      console.error("[SecureStorage]: Failed to load private key", error);
      return null;
    }
  }

  /**
   * Delete private key for an address
   */
  static async deletePrivateKey(address: string): Promise<boolean> {
    try {
      const key = `${KEYS.PRIVATE_KEY_PREFIX}${address.toLowerCase()}`;
      await SecureStore.deleteItemAsync(key, secureStoreOptions);
      return true;
    } catch (error) {
      console.error("[SecureStorage]: Failed to delete private key", error);
      return false;
    }
  }

  /**
   * Check if wallet is initialized
   */
  static async isWalletInitialized(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(KEYS.WALLET_INITIALIZED);
      return value === "true";
    } catch (error) {
      console.error(
        "[SecureStorage]: Failed to check wallet initialization",
        error,
      );
      return false;
    }
  }

  /**
   * Set wallet initialized flag
   */
  static async setWalletInitialized(initialized: boolean): Promise<boolean> {
    try {
      await AsyncStorage.setItem(
        KEYS.WALLET_INITIALIZED,
        initialized ? "true" : "false",
      );
      return true;
    } catch (error) {
      console.error(
        "[SecureStorage]: Failed to set wallet initialization",
        error,
      );
      return false;
    }
  }

  /**
   * Clear all secure data (for wallet reset)
   */
  static async clearAll(): Promise<boolean> {
    try {
      await SecureStore.deleteItemAsync(KEYS.MNEMONIC, secureStoreOptions);
      await AsyncStorage.removeItem(KEYS.WALLET_INITIALIZED);
      // Note: Individual private keys would need to be cleared based on known addresses
      return true;
    } catch (error) {
      console.error("[SecureStorage]: Failed to clear all data", error);
      return false;
    }
  }
}

/**
 * AppStorage - Handles non-sensitive app data
 */
export class AppStorage {
  /**
   * Save JSON data
   */
  static async saveJSON<T>(key: string, data: T): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("[AppStorage]: Failed to save JSON", error);
      return false;
    }
  }

  /**
   * Load JSON data
   */
  static async loadJSON<T>(key: string): Promise<T | null> {
    try {
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("[AppStorage]: Failed to load JSON", error);
      return null;
    }
  }

  /**
   * Remove data
   */
  static async remove(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error("[AppStorage]: Failed to remove data", error);
      return false;
    }
  }

  /**
   * Clear all app storage
   */
  static async clearAll(): Promise<boolean> {
    try {
      await AsyncStorage.clear();
      return true;
    } catch (error) {
      console.error("[AppStorage]: Failed to clear all data", error);
      return false;
    }
  }
}
