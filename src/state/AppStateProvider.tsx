import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRemoteState } from "./useRemoteState";
import type { AppState, Category, SyncStatus } from "../shared/types";

type AppStateContextValue = {
  state: AppState;
  status: SyncStatus;
  loaded: boolean;
  setActiveCategory: (category: Category) => void;
  setActiveDay: (category: Category, day: number) => void;
  setProgramStartDate: (iso: string) => void;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { state, update, status, loaded } = useRemoteState();

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      status,
      loaded,
      setActiveCategory: (category) =>
        update((prev) => ({ ...prev, ui: { ...prev.ui, activeCategory: category } })),
      setActiveDay: (category, day) =>
        update((prev) => ({
          ...prev,
          ui: {
            ...prev.ui,
            activeDayByCategory: { ...prev.ui.activeDayByCategory, [category]: day },
          },
        })),
      setProgramStartDate: (iso) => update((prev) => ({ ...prev, programStartDate: iso })),
    }),
    [state, status, loaded, update],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside an AppStateProvider");
  return value;
}
