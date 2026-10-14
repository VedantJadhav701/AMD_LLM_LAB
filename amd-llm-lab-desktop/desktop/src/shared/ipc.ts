import type { BenchResult, Calibration, ChatMessage, GenStats, Goal, InstalledModel, MachineProfile, ModelSpec, QuantId, Recommendation, RuntimeStatus, Settings, Verdict } from "./types";

export interface HubPreview { payload: unknown; hubUrl: string }
export interface AppInfo { version: string; platform: string; arch: string; userData: string }

/** Request/response calls. The preload exposes exactly these and nothing else. */
export interface InvokeMap {
  "app:info": [void, AppInfo];
  "app:openExternal": [string, boolean];
  "machine:get": [void, MachineProfile];
  "machine:refresh": [void, MachineProfile];
  "settings:get": [void, Settings];
  "settings:set": [Partial<Settings>, Settings];
  "catalog:list": [void, ModelSpec[]];
  "hf:lookup": [string, { spec: ModelSpec; warnings: string[] }];
  "decide:recommend": [{ goal: Goal; ctx: number }, Recommendation[]];
  "decide:evaluate": [{ modelId: string; ctx: number }, { spec: ModelSpec; verdicts: Verdict[] }];
  "runtime:refresh": [void, RuntimeStatus[]];
  "runtime:models": [string, InstalledModel[]];
  "chat:start": [{ runtimeId: string; model: string; messages: ChatMessage[]; ctx: number }, string];
  "chat:stop": [string, void];
  "bench:start": [{ runtimeId: string; model: InstalledModel; ctx: number }, string];
  "bench:cancel": [void, void];
  "pull:start": [{ runtimeId: string; model: string }, string];
  "pull:cancel": [string, void];
  "history:list": [void, BenchResult[]];
  "history:delete": [string, BenchResult[]];
  "history:clear": [void, void];
  "calibration:get": [void, Calibration];
  "calibration:clear": [void, void];
  "hub:preview": [string, HubPreview | { error: string }];
  "hub:submit": [string, { id: string; status: string; reasons: string[] }];
}

/** Events pushed from main to the renderer. */
export interface EventMap {
  "chat:token": { id: string; text: string };
  "chat:done": { id: string; stats: GenStats };
  "chat:error": { id: string; message: string };
  "bench:progress": { id: string; step: string; frac: number };
  "bench:done": { id: string; result?: BenchResult; calibration?: Calibration; error?: string; cancelled?: boolean };
  "pull:progress": { id: string; status: string; completed?: number; total?: number };
  "pull:done": { id: string; error?: string };
}

export interface LabApi {
  invoke<K extends keyof InvokeMap>(channel: K, arg?: InvokeMap[K][0]): Promise<InvokeMap[K][1]>;
  on<K extends keyof EventMap>(channel: K, cb: (payload: EventMap[K]) => void): () => void;
}
export const INVOKE_CHANNELS: Array<keyof InvokeMap> = [
  "app:info", "app:openExternal", "machine:get", "machine:refresh", "settings:get", "settings:set", "catalog:list", "hf:lookup", "decide:recommend", "decide:evaluate",
  "runtime:refresh", "runtime:models", "chat:start", "chat:stop", "bench:start", "bench:cancel", "pull:start", "pull:cancel", "history:list", "history:delete", "history:clear",
  "calibration:get", "calibration:clear", "hub:preview", "hub:submit",
];
export const EVENT_CHANNELS: Array<keyof EventMap> = ["chat:token", "chat:done", "chat:error", "bench:progress", "bench:done", "pull:progress", "pull:done"];
export type { QuantId };
