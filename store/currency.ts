import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CurrencyInfo {
  code: string;     // lowercase CoinGecko id, e.g. "usd"
  symbol: string;   // display symbol, e.g. "$"
  name: string;     // full name, e.g. "US Dollar"
  flag: string;     // emoji flag
  decimals: number; // display decimal places (0 for JPY/KRW)
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: "usd", symbol: "$",    name: "US Dollar",          flag: "🇺🇸", decimals: 2 },
  { code: "eur", symbol: "€",    name: "Euro",               flag: "🇪🇺", decimals: 2 },
  { code: "gbp", symbol: "£",    name: "British Pound",      flag: "🇬🇧", decimals: 2 },
  { code: "jpy", symbol: "¥",    name: "Japanese Yen",       flag: "🇯🇵", decimals: 0 },
  { code: "chf", symbol: "Fr",   name: "Swiss Franc",        flag: "🇨🇭", decimals: 2 },
  { code: "aud", symbol: "A$",   name: "Australian Dollar",  flag: "🇦🇺", decimals: 2 },
  { code: "cad", symbol: "C$",   name: "Canadian Dollar",    flag: "🇨🇦", decimals: 2 },
  { code: "krw", symbol: "₩",    name: "Korean Won",         flag: "🇰🇷", decimals: 0 },
  { code: "sgd", symbol: "S$",   name: "Singapore Dollar",   flag: "🇸🇬", decimals: 2 },
  { code: "hkd", symbol: "HK$",  name: "Hong Kong Dollar",   flag: "🇭🇰", decimals: 2 },
  { code: "nzd", symbol: "NZ$",  name: "New Zealand Dollar", flag: "🇳🇿", decimals: 2 },
  { code: "brl", symbol: "R$",   name: "Brazilian Real",     flag: "🇧🇷", decimals: 2 },
  { code: "inr", symbol: "₹",    name: "Indian Rupee",       flag: "🇮🇳", decimals: 2 },
  { code: "try", symbol: "₺",    name: "Turkish Lira",       flag: "🇹🇷", decimals: 2 },
  { code: "mxn", symbol: "MX$",  name: "Mexican Peso",       flag: "🇲🇽", decimals: 2 },
  { code: "aed", symbol: "د.إ",  name: "UAE Dirham",         flag: "🇦🇪", decimals: 2 },
  { code: "nok", symbol: "kr",   name: "Norwegian Krone",    flag: "🇳🇴", decimals: 2 },
  { code: "sek", symbol: "kr",   name: "Swedish Krona",      flag: "🇸🇪", decimals: 2 },
  { code: "dkk", symbol: "kr",   name: "Danish Krone",       flag: "🇩🇰", decimals: 2 },
  { code: "zar", symbol: "R",    name: "South African Rand", flag: "🇿🇦", decimals: 2 },
];

export function getCurrencyInfo(code: string): CurrencyInfo {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? SUPPORTED_CURRENCIES[0];
}

interface CurrencyState {
  selectedCurrency: string;
}

interface CurrencyActions {
  setCurrency: (code: string) => void;
}

export const useCurrencyStore = create<CurrencyState & CurrencyActions>()(
  persist(
    (set) => ({
      selectedCurrency: "usd",
      setCurrency: (code) => set({ selectedCurrency: code }),
    }),
    {
      name: "zap-currency-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const useSelectedCurrency = () =>
  useCurrencyStore((s) => s.selectedCurrency);

export const useSelectedCurrencyInfo = () =>
  useCurrencyStore((s) => getCurrencyInfo(s.selectedCurrency));
