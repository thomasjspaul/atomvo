export type * from "../shared/types";
import type {
  Entry,
  ExerciseProgressPoint,
  ExerciseProgressRow,
  Favourite,
  Gym,
  MemoryNote,
  Settings,
  Target,
  Weight,
  WorkoutSessionDetail,
  WorkoutSessionSummary,
  WorkoutTemplate,
} from "../shared/types";

export interface SettingsResponse {
  settings: Settings;
  derived: {
    latest_weight_kg: number | null;
    latest_weight_lb: number | null;
    mifflin_bmr: number | null;
    scale_bmr: number | null;
    effective_bmr: number | null;
  };
  ingest: { url: string; configured: boolean };
  ai_configured: boolean;
}

export interface MemoryResponse {
  active: MemoryNote[];
  suggested: MemoryNote[];
  archived: MemoryNote[];
}

export interface MealsListResponse {
  date: string;
  entries: Entry[];
}

export interface FavouritesResponse {
  favourites: Favourite[];
}

export interface WeightsResponse {
  weights: Weight[];
}

export interface TargetHistoryResponse {
  history: Target[];
}

export interface GymsResponse {
  gyms: Gym[];
  current_gym_id: string | null;
}

export interface ActiveWorkoutResponse {
  session: WorkoutSessionDetail | null;
}

export interface WorkoutHistoryResponse {
  sessions: WorkoutSessionSummary[];
}

export interface WorkoutTemplatesResponse {
  templates: WorkoutTemplate[];
}

export interface ExerciseSearchResponse {
  results: ExerciseProgressRow[];
}

export interface ExerciseProgressResponse {
  points: ExerciseProgressPoint[];
}
