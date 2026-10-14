import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppInfo, EventMap, InvokeMap, LabApi } from "../shared/ipc";
import type { Calibration, MachineProfile, RuntimeStatus, Settings } from "../shared/types";

declare global { interface Window { lab: LabApi } }
export const api = { invoke: <K extends keyof InvokeMap>(c: K, a?: InvokeMap[K][0]) => window.lab.invoke(c, a), on: <K extends keyof EventMap>(c: K, cb: (p: EventMap[K]) => void) => window.lab.on(c, cb) };

export type Page = "overview" | "canrun" | "fit" | "lab" | "machine" | "history" | "settings";
interface Ctx {
  page: Page; go: (p: Page, arg?: unknown) => void; navArg: unknown;
  info: AppInfo | null; machine: MachineProfile | null; machineError: string | null; scanning: boolean; rescan: () => Promise<void>;
  settings: Settings | null; saveSettings: (p: Partial<Settings>) => Promise<void>;
  runtimes: RuntimeStatus[]; refreshRuntimes: () => Promise<void>; calibration: Calibration; setCalibration: (c: Calibration) => void;
  /** Bumps whenever something that changes predictions changed (overrides, calibration, kv settings). */
  rev: number;
}
const C = createContext<Ctx>(null as never);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>("overview");
  const [navArg, setNavArg] = useState<unknown>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [machine, setMachine] = useState<MachineProfile | null>(null);
  const [machineError, setMachineError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [calibration, setCalibrationState] = useState<Calibration>({});
  const [rev, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const started = useRef(false);

  const scan = useCallback(async (force: boolean) => {
    setScanning(true); setMachineError(null);
    try { setMachine(await api.invoke(force ? "machine:refresh" : "machine:get")); bump(); }
    catch (e) { setMachineError((e as Error).message); }
    finally { setScanning(false); }
  }, []);
  const refreshRuntimes = useCallback(async () => { try { setRuntimes(await api.invoke("runtime:refresh")); } catch { setRuntimes([]); } }, []);
  const saveSettings = useCallback(async (p: Partial<Settings>) => {
    const s = await api.invoke("settings:set", p); setSettings(s);
    if (p.overrides) setMachine(await api.invoke("machine:get"));
    if (p.customRuntimeUrl !== undefined) void refreshRuntimes();
    bump();
  }, [refreshRuntimes]);

  useEffect(() => {
    if (started.current) return; started.current = true;
    void api.invoke("app:info").then(setInfo);
    void api.invoke("settings:get").then(setSettings);
    void api.invoke("calibration:get").then(setCalibrationState);
    void scan(false); void refreshRuntimes();
  }, [scan, refreshRuntimes]);

  const value = useMemo<Ctx>(() => ({
    page, navArg, go: (p, arg) => { setNavArg(arg ?? null); setPage(p); }, info, machine, machineError, scanning, rescan: () => scan(true), settings, saveSettings,
    runtimes, refreshRuntimes, calibration, setCalibration: (c) => { setCalibrationState(c); bump(); }, rev,
  }), [page, navArg, info, machine, machineError, scanning, scan, settings, saveSettings, runtimes, refreshRuntimes, calibration, rev]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
