import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRemoteState } from "./useRemoteState";
import { toggleCompletedStep } from "../shared/progress";
import { todayIso, weekdayDateIso } from "../shared/date";
import type { AppState, Category, SyncStatus } from "../shared/types";

type AppStateContextValue = {
  state: AppState;
  status: SyncStatus;
  loaded: boolean;
  setActiveCategory: (category: Category) => void;
  setActiveDay: (category: Category, day: number) => void;
  setProgramStartDate: (iso: string) => void;
  toggleStep: (category: Category, dayIndex: number, stepId: string) => void;
  editContent: (mutate: (state: AppState) => AppState) => void;
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
      setProgramStartDate: (iso) => {
        // A cleared <input type="date"> posts "" — ignore it rather than write a
        // blank programStartDate that would make programWeek()/resolveDayForState() clamp.
        if (!iso) return;
        update((prev) => ({ ...prev, programStartDate: iso }));
      },
      // Stamps the date from the real todayIso(); DayPanel/WeekProgress accept a
      // `now` override for tests, but this seam is intentionally one-sided —
      // production check-offs are always "real now".
      toggleStep: (category, dayIndex, stepId) =>
        update((prev) =>
          toggleCompletedStep(prev, {
            date: weekdayDateIso(dayIndex, todayIso()),
            category,
            stepId,
          }),
        ),
      editContent: (mutate) => update(mutate),
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
