import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRemoteState } from "./useRemoteState";
import { toggleCompletedStep } from "../shared/progress";
import { todayIso, weekdayDateIso } from "../shared/date";
import type { AppState, Category, StepPhase, SyncStatus } from "../shared/types";

type AppStateContextValue = {
  state: AppState;
  status: SyncStatus;
  loaded: boolean;
  setActiveCategory: (category: Category) => void;
  setActiveDay: (category: Category, day: number) => void;
  setProgramStartDate: (iso: string) => void;
  toggleStep: (category: Category, dayIndex: number, phase: StepPhase, stepIndex: number) => void;
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
      toggleStep: (category, dayIndex, phase, stepIndex) =>
        update((prev) =>
          toggleCompletedStep(prev, {
            date: weekdayDateIso(dayIndex, todayIso()),
            category,
            phase,
            stepIndex,
          }),
        ),
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
