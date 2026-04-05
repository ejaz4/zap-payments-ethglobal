import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface DemoState {
  demoMode: boolean;
}

interface DemoActions {
  setDemoMode: (enabled: boolean) => void;
  toggleDemoMode: () => void;
}

export const useDemoStore = create<DemoState & DemoActions>()(
  persist(
    (set, get) => ({
      demoMode: false,
      setDemoMode: (enabled) => set({ demoMode: enabled }),
      toggleDemoMode: () => set({ demoMode: !get().demoMode }),
    }),
    {
      name: "zap-demo-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const useDemoMode = () => useDemoStore((s) => s.demoMode);
