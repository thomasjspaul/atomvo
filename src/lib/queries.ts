import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ActiveWorkoutResponse,
  DayResponse,
  ExerciseCatalogEntry,
  ExercisePickGroupsResponse,
  MuscleBalanceResponse,
  ExerciseProgressResponse,
  ExerciseSearchResponse,
  ExerciseSuggestion,
  ExerciseSuggestResponse,
  FavouritesResponse,
  GymsResponse,
  LogMealResponse,
  MealsListResponse,
  MemoryResponse,
  InsightsResponse,
  SettingsResponse,
  StatsResponse,
  TargetHistoryResponse,
  Weight,
  WeightTrendPoint,
  WeightsResponse,
  WhoopImportResult,
  WorkoutHistoryResponse,
  WorkoutSessionDetail,
  WorkoutTemplate,
  WorkoutTemplatesResponse,
  WyzeImportResult,
} from "../types";

type TemplateItemInput = {
  name: string;
  catalog_id?: string | null;
  target_sets?: number | null;
  target_reps?: string | null;
  target_rpe?: number | null;
  position?: number;
  alternatives?: { name: string; catalog_id?: string | null }[];
};

export function useDay(date?: string) {
  return useQuery({
    queryKey: ["day", date ?? "today"],
    queryFn: () => api.get<DayResponse>(`/api/day${date ? `?date=${date}` : ""}`),
  });
}

export function useMeals(date: string) {
  return useQuery({
    queryKey: ["meals", date],
    queryFn: () => api.get<MealsListResponse>(`/api/meals?date=${date}`),
  });
}

export function useStats(range: 14 | 30 | 90) {
  return useQuery({
    queryKey: ["stats", range],
    queryFn: () => api.get<StatsResponse>(`/api/stats?range=${range}`),
  });
}

export type InsightRange = "30" | "90" | "180" | "365" | "all";

export function useInsights(range: InsightRange) {
  return useQuery({
    queryKey: ["insights", range],
    queryFn: () => api.get<InsightsResponse>(`/api/insights?range=${range}`),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/api/settings"),
  });
}

export function useFavourites() {
  return useQuery({
    queryKey: ["favourites"],
    queryFn: () => api.get<FavouritesResponse>("/api/favourites"),
  });
}

export function useMemory() {
  return useQuery({
    queryKey: ["memory"],
    queryFn: () => api.get<MemoryResponse>("/api/memory"),
  });
}

export function useWeights() {
  return useQuery({
    queryKey: ["weights"],
    queryFn: () => api.get<WeightsResponse>("/api/weights"),
  });
}

export function useWeightTrend(days = 90) {
  return useQuery({
    queryKey: ["weight-trend", days],
    queryFn: () => api.get<{ trend: WeightTrendPoint[] }>(`/api/weights/trend?days=${days}`),
  });
}

export function useTargetHistory() {
  return useQuery({
    queryKey: ["target-history"],
    queryFn: () => api.get<TargetHistoryResponse>("/api/targets/history"),
  });
}

/** Invalidate everything that a new/changed entry can affect. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["day"] }),
      qc.invalidateQueries({ queryKey: ["meals"] }),
      qc.invalidateQueries({ queryKey: ["stats"] }),
      qc.invalidateQueries({ queryKey: ["insights"] }),
      qc.invalidateQueries({ queryKey: ["memory"] }),
      qc.invalidateQueries({ queryKey: ["favourites"] }),
      qc.invalidateQueries({ queryKey: ["target-history"] }),
      qc.invalidateQueries({ queryKey: ["workout"] }),
      qc.invalidateQueries({ queryKey: ["workouts"] }),
    ]);
}

export function useLogMeal() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (form: FormData) => api.postForm<LogMealResponse>("/api/meals", form),
    onSuccess: invalidate,
  });
}

export function useLogFavourite() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, occurred_at }: { id: string; occurred_at?: string }) =>
      api.post(`/api/favourites/${id}/log`, occurred_at ? { occurred_at } : {}),
    onSuccess: invalidate,
  });
}

type FavouriteInput = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  creatine_g?: number | null;
};

/** Create (no id) or update (with id) a favourite. */
export function useUpsertFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: FavouriteInput & { id?: string }) =>
      id ? api.patch(`/api/favourites/${id}`, body) : api.post("/api/favourites", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["favourites"] });
      qc.invalidateQueries({ queryKey: ["day"] });
    },
  });
}

export function useDeleteFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/favourites/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["favourites"] });
      qc.invalidateQueries({ queryKey: ["day"] });
    },
  });
}

export function useLogHydration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      volume_ml: number;
      kind?: "water" | "caffeine";
      occurred_at?: string;
    }) => api.post("/api/hydration", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useDeleteHydration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/hydration/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useImportWhoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) =>
      api.postForm<WhoopImportResult>("/api/import/whoop", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

export function useImportWyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) =>
      api.postForm<WyzeImportResult>("/api/import/wyze", form),
    onSuccess: () => {
      for (const k of ["day", "stats", "insights", "settings", "weights", "weight-trend"]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });
}

// ---- gym ----------------------------------------------------------------

export function useActiveWorkout() {
  return useQuery({
    queryKey: ["workout", "active"],
    queryFn: () => api.get<ActiveWorkoutResponse>("/api/workouts/active"),
  });
}

export function useWorkoutSession(id: string | null) {
  return useQuery({
    queryKey: ["workout", id],
    queryFn: () => api.get<WorkoutSessionDetail>(`/api/workouts/${id}`),
    enabled: !!id,
  });
}

export function useWorkoutHistory(from?: string, to?: string, limit?: number) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (limit) qs.set("limit", String(limit));
  const suffix = qs.toString();
  return useQuery({
    queryKey: ["workouts", from ?? null, to ?? null, limit ?? null],
    queryFn: () =>
      api.get<WorkoutHistoryResponse>(`/api/workouts${suffix ? `?${suffix}` : ""}`),
  });
}

export function useGyms() {
  return useQuery({
    queryKey: ["gyms"],
    queryFn: () => api.get<GymsResponse>("/api/gyms"),
  });
}

export function useExerciseSuggest(q: string) {
  return useQuery({
    queryKey: ["exercise-suggest", q],
    queryFn: () =>
      api.get<ExerciseSuggestResponse>(`/api/exercises?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useRecentExercises() {
  return useQuery({
    queryKey: ["exercise-recent"],
    queryFn: () => api.get<{ exercises: ExerciseSuggestion[] }>("/api/exercises/recent"),
  });
}

export function useExercisePickGroups() {
  return useQuery({
    queryKey: ["exercise-pick-groups"],
    queryFn: () => api.get<ExercisePickGroupsResponse>("/api/exercises/pick-groups"),
  });
}

export function useExercisesByMuscle(muscle: string | null) {
  return useQuery({
    queryKey: ["exercise-by-muscle", muscle],
    queryFn: () =>
      api.get<ExerciseSuggestResponse>(
        `/api/exercises/by-muscle?muscle=${encodeURIComponent(muscle ?? "")}`,
      ),
    enabled: !!muscle,
    staleTime: 5 * 60_000,
  });
}

export function useExerciseDetail(id: string | null) {
  return useQuery({
    queryKey: ["exercise", id],
    queryFn: () => api.get<ExerciseCatalogEntry>(`/api/exercises/${id}`),
    enabled: !!id,
  });
}

function useInvalidateWorkouts() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["workout"] }),
      qc.invalidateQueries({ queryKey: ["workouts"] }),
      qc.invalidateQueries({ queryKey: ["exercise-recent"] }),
      qc.invalidateQueries({ queryKey: ["exercise-pick-groups"] }),
    ]);
}

// Session-editing endpoints (sets, exercises) already return the full, freshly
// computed session in their response body. Write it straight into the cache
// instead of invalidating + refetching — that second round trip (plus the
// N+1 last-performance/alternatives lookups it repeats server-side) is what
// made every set edit feel laggy on mobile.
function useSyncSession() {
  const qc = useQueryClient();
  return (session: WorkoutSessionDetail) => {
    qc.setQueryData<ActiveWorkoutResponse>(["workout", "active"], (old) =>
      old?.session?.id === session.id ? { session } : old,
    );
    qc.setQueryData(["workout", session.id], session);
  };
}

export function useStartWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: (body?: { gym_id?: string; title?: string; tracking_date?: string }) =>
      api.post<{ session: WorkoutSessionDetail; resumed: boolean }>(
        "/api/workouts",
        body ?? {},
      ),
    onSuccess: invalidate,
  });
}

export function usePatchWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<WorkoutSessionDetail>(`/api/workouts/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useFinishWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: (id: string) => api.post<WorkoutSessionDetail>(`/api/workouts/${id}/finish`),
    onSuccess: invalidate,
  });
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/workouts/${id}`),
    onSuccess: invalidate,
  });
}

export function useAddSessionExercise() {
  const sync = useSyncSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      ...body
    }: { sessionId: string } & Record<string, unknown>) =>
      api.post<WorkoutSessionDetail>(`/api/workouts/${sessionId}/exercises`, body),
    onSuccess: (session) => {
      sync(session);
      qc.invalidateQueries({ queryKey: ["exercise-recent"] });
      // Fill in description + muscle groups in the background. Refetch rather
      // than write the response into the cache: a set logged while the AI was
      // thinking would otherwise be clobbered by the older snapshot.
      const added = session.exercises.reduce<WorkoutSessionDetail["exercises"][number] | null>(
        (a, e) => (a == null || e.position >= a.position ? e : a),
        null,
      );
      if (added && !added.description) {
        api
          .post(`/api/workouts/${session.id}/exercises/${added.id}/enrich`)
          .then(() => qc.invalidateQueries({ queryKey: ["workout"] }))
          .catch(() => {});
      }
    },
  });
}

export function usePatchSessionExercise() {
  const sync = useSyncSession();
  return useMutation({
    mutationFn: ({
      sessionId,
      exId,
      ...body
    }: { sessionId: string; exId: string } & Record<string, unknown>) =>
      api.patch<WorkoutSessionDetail>(
        `/api/workouts/${sessionId}/exercises/${exId}`,
        body,
      ),
    onSuccess: sync,
  });
}

export function useDeleteSessionExercise() {
  const sync = useSyncSession();
  return useMutation({
    mutationFn: ({ sessionId, exId }: { sessionId: string; exId: string }) =>
      api.del<WorkoutSessionDetail>(`/api/workouts/${sessionId}/exercises/${exId}`),
    onSuccess: sync,
  });
}

export function useAddSet() {
  const sync = useSyncSession();
  return useMutation({
    mutationFn: ({
      sessionId,
      exId,
      ...body
    }: { sessionId: string; exId: string } & Record<string, unknown>) =>
      api.post<WorkoutSessionDetail>(
        `/api/workouts/${sessionId}/exercises/${exId}/sets`,
        body,
      ),
    onSuccess: sync,
  });
}

export function usePatchSet() {
  const sync = useSyncSession();
  return useMutation({
    mutationFn: ({
      sessionId,
      setId,
      ...body
    }: { sessionId: string; setId: string } & Record<string, unknown>) =>
      api.patch<WorkoutSessionDetail>(`/api/workouts/${sessionId}/sets/${setId}`, body),
    onSuccess: sync,
  });
}

export function useDeleteSet() {
  const sync = useSyncSession();
  return useMutation({
    mutationFn: ({ sessionId, setId }: { sessionId: string; setId: string }) =>
      api.del<WorkoutSessionDetail>(`/api/workouts/${sessionId}/sets/${setId}`),
    onSuccess: sync,
  });
}

export function useUpsertGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; name: string; location?: string }) =>
      id ? api.patch(`/api/gyms/${id}`, body) : api.post("/api/gyms", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gyms"] }),
  });
}

export function useSelectGym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/gyms/${id}/select`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gyms"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useExerciseSearch(q: string, days: number) {
  return useQuery({
    queryKey: ["exercise-search", q, days],
    queryFn: () =>
      api.get<ExerciseSearchResponse>(
        `/api/workouts/exercise-search?q=${encodeURIComponent(q)}&days=${days}`,
      ),
  });
}

export function useMuscleBalance(days: number) {
  return useQuery({
    queryKey: ["workouts", "muscle-balance", days],
    queryFn: () => api.get<MuscleBalanceResponse>(`/api/workouts/muscle-balance?days=${days}`),
  });
}

export function useExerciseProgress(name: string, catalogId: string | null, days: number) {
  const qs = new URLSearchParams({ name, days: String(days) });
  if (catalogId) qs.set("catalog_id", catalogId);
  return useQuery({
    queryKey: ["exercise-progress", name, catalogId, days],
    queryFn: () => api.get<ExerciseProgressResponse>(`/api/workouts/progress?${qs}`),
    enabled: !!(name || catalogId),
  });
}

export function useWorkoutTemplates() {
  return useQuery({
    queryKey: ["workout-templates"],
    queryFn: () => api.get<WorkoutTemplatesResponse>("/api/workout-templates"),
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      name: string;
      description?: string | null;
    }) =>
      id
        ? api.patch<WorkoutTemplate>(`/api/workout-templates/${id}`, body)
        : api.post<WorkoutTemplate>("/api/workout-templates", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout-templates"] }),
  });
}

export function useReplaceTemplateItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: TemplateItemInput[] }) =>
      api.put<WorkoutTemplate>(`/api/workout-templates/${id}/items`, { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout-templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/workout-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout-templates"] }),
  });
}

export function useStartTemplate() {
  const invalidate = useInvalidateWorkouts();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      tracking_date,
    }: {
      templateId: string;
      tracking_date?: string;
    }) =>
      api.post<{ session: WorkoutSessionDetail; resumed: boolean }>("/api/workouts", {
        template_id: templateId,
        tracking_date,
      }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["workout-templates"] });
    },
  });
}

export function useCanonicalizeExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      canonical_name: string;
      primary_muscle?: string | null;
      equipment?: string | null;
      category?: string | null;
      alternatives?: string[];
    }) => api.post<ExerciseCatalogEntry>("/api/exercises", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercise-suggest"] });
      qc.invalidateQueries({ queryKey: ["exercise-recent"] });
    },
  });
}

export function useAddWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Weight>("/api/weights", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weights"] });
      qc.invalidateQueries({ queryKey: ["weight-trend"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["day"] });
      qc.invalidateQueries({ queryKey: ["target-history"] });
    },
  });
}
