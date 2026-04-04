// shim.ts
// IMPORTANT: Crypto polyfills MUST be imported before anything else
import { Buffer } from "buffer";
import * as ExpoCrypto from "expo-crypto";
import "react-native-get-random-values";

// 1. Polyfill crypto for ethers v6 using expo-crypto
if (typeof global.crypto === "undefined") {
  // @ts-ignore
  global.crypto = {};
}

// Ensure getRandomValues is available (from react-native-get-random-values)
// Also add randomBytes for ethers v6 compatibility
// @ts-ignore
if (typeof global.crypto.randomBytes === "undefined") {
  // @ts-ignore
  global.crypto.randomBytes = (size: number): Uint8Array => {
    return ExpoCrypto.getRandomBytes(size);
  };
}

// Override getRandomValues with expo-crypto implementation for reliability
const originalGetRandomValues = global.crypto?.getRandomValues;
// @ts-ignore
global.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
  if (array instanceof Uint8Array) {
    const randomBytes = ExpoCrypto.getRandomBytes(array.length);
    array.set(randomBytes);
    return array;
  }
  // Fallback for other typed arrays
  if (originalGetRandomValues) {
    return originalGetRandomValues.call(global.crypto, array);
  }
  throw new Error("getRandomValues not supported for this array type");
};

// 2. Polyfill Buffer
// @ts-ignore: TS gets angry about overwriting global Buffer, but it works
global.Buffer = Buffer;

// 3. Polyfill process
// @ts-ignore
if (typeof global.process === "undefined") {
  // @ts-ignore
  global.process = require("process");
}

// 4. Polyfill BigInt (Critical for Ethers v6 on older Hermes versions)
if (typeof BigInt === "undefined") {
  const BigInt = require("big-integer");
  // @ts-ignore
  global.BigInt = BigInt;
}
