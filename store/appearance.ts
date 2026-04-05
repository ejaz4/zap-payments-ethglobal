import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, ColorSchemeName } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const ACCENT_PRESETS = [
  { name: "Emerald", color: "#569F8C" },
  { name: "Cyan", color: "#6CE5E8" },
  { name: "Blue", color: "#5B8DEF" },
  { name: "Purple", color: "#A78BFA" },
  { name: "Pink", color: "#F472B6" },
  { name: "Rose", color: "#FB7185" },
  { name: "Orange", color: "#FB923C" },
  { name: "Yellow", color: "#FACC15" },
  { name: "Lime", color: "#A3E635" },
  { name: "Teal", color: "#2DD4BF" },
] as const;

interface AppearanceState {
  accentColor: string;
}

interface AppearanceActions {
  setAccentColor: (color: string) => void;
}

export const useAppearanceStore = create<AppearanceState & AppearanceActions>()(
  persist(
    (set) => ({
      accentColor: "#569F8C",
      setAccentColor: (color) => set({ accentColor: color }),
    }),
    {
      name: "zap-appearance-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const useAccentColor = () =>
  useAppearanceStore((s) => s.accentColor);

/**
 * Returns the accent color at a given opacity (for backgrounds/tints).
 * Usage: accentTint(0.2) => "rgba(86, 159, 140, 0.2)"
 */
export function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function resolveColorScheme(scheme?: ColorSchemeName): "light" | "dark" {
  if (scheme === "light" || scheme === "dark") return scheme;
  return Appearance.getColorScheme() === "light" ? "light" : "dark";
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

/**
 * Mix a small amount of the accent color into a dark base.
 * amount: 0 = pure base, 1 = pure accent (typical: 0.06–0.12)
 */
export function tintedBackground(
  accent: string,
  amount: number = 0.08,
  base?: string,
  scheme?: ColorSchemeName,
): string {
  const mode = resolveColorScheme(scheme);
  const resolvedBase = base || (mode === "dark" ? "#000000" : "#F6FBF8");
  const resolvedAmount = mode === "dark" ? amount : Math.min(amount, 0.06);
  const [ar, ag, ab] = parseHex(accent);
  const [br, bg, bb] = parseHex(resolvedBase);
  return toHex(
    br + (ar - br) * resolvedAmount,
    bg + (ag - bg) * resolvedAmount,
    bb + (ab - bb) * resolvedAmount,
  );
}

/**
 * Derives the surface/card color (slightly lighter than background).
 */
export function tintedSurface(
  accent: string,
  amount: number = 0.12,
  base?: string,
  scheme?: ColorSchemeName,
): string {
  const mode = resolveColorScheme(scheme);
  const resolvedBase = base || (mode === "dark" ? "#111111" : "#FFFFFF");
  const resolvedAmount = mode === "dark" ? amount : Math.min(amount, 0.07);
  return tintedBackground(accent, resolvedAmount, resolvedBase, mode);
}
