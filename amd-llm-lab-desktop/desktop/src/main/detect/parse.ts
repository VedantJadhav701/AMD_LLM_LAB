// Pure parsers: turn raw OS output into a MachineProfile. No I/O here so they can be unit tested.
import type { GpuInfo, MachineProfile, Platform } from "../../shared/types";
import { accelSupport, appleBandwidth, classifyGpuKind, cpuVendor, lookupGpuBandwidth, guessDiscreteBandwidth, npuFor, vendorFromText } from "../../core/hwdb";

const KIB = 1024, GIB = 1024 ** 3;
const arr = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const num = (x: unknown): number | null => { const n = Number(x); return Number.isFinite(n) && n > 0 ? n : null; };

interface WinGpu { Name?: string; AdapterRAM?: number | null; DriverVersion?: string; QwMemory?: number | string | null }
export interface WinRaw {
  cpu?: { Name?: string; NumberOfCores?: number; NumberOfLogicalProcessors?: number } | Array<{ Name?: string; NumberOfCores?: number; NumberOfLogicalProcessors?: number }>;
  os?: { Caption?: string; Version?: string; FreePhysicalMemory?: number; TotalVisibleMemorySize?: number };
  gpus?: WinGpu[] | WinGpu;
  ram?: Array<{ Speed?: number; ConfiguredClockSpeed?: number; SMBIOSMemoryType?: number }> | { Speed?: number };
  battery?: Array<{ BatteryStatus?: number }> | { BatteryStatus?: number } | null;
  system?: { Manufacturer?: string; Model?: string };
  diskFreeBytes?: number | null;
  arch?: string;
}

const SMBIOS: Record<number, string> = { 26: "DDR4", 34: "DDR5", 35: "LPDDR5", 29: "LPDDR3", 30: "LPDDR4", 27: "LPDDR" };

export function parseWindows(raw: WinRaw): Omit<MachineProfile, "collectedAt" | "overrides" | "memProbe" | "notes"> & { notes: string[] } {
  const notes: string[] = [];
  const cpuRaw = arr(raw.cpu);
  const cpuName = (cpuRaw[0]?.Name ?? "Unknown CPU").replace(/\s+/g, " ").trim();
  const physical = cpuRaw.reduce((a, c) => a + (c.NumberOfCores ?? 0), 0) || null;
  const logical = cpuRaw.reduce((a, c) => a + (c.NumberOfLogicalProcessors ?? 0), 0) || 4;
  const totalGiB = ((raw.os?.TotalVisibleMemorySize ?? 0) * KIB) / GIB;
  const freeGiB = ((raw.os?.FreePhysicalMemory ?? 0) * KIB) / GIB;
  const ramRow = arr(raw.ram)[0] as { Speed?: number; ConfiguredClockSpeed?: number; SMBIOSMemoryType?: number } | undefined;
  const cpuVend = cpuVendor(cpuName);

  const seen = new Set<string>();
  const gpus: GpuInfo[] = [];
  for (const g of arr(raw.gpus)) {
    const name = (g.Name ?? "").trim();
    if (!name || /microsoft basic|remote display|virtual|parsec|displaylink/i.test(name) || seen.has(name + g.DriverVersion)) continue;
    seen.add(name + g.DriverVersion);
    const vendor = vendorFromText(name);
    // Registry qword is the real VRAM size. WMI AdapterRAM is a uint32 and wraps at 4 GiB.
    const qw = num(g.QwMemory);
    const adapter = num(g.AdapterRAM);
    const bytes = qw ?? adapter;
    let dedicated = bytes ? bytes / GIB : null;
    if (!qw && adapter && adapter >= 4 * GIB - 8 * 1024 * 1024) { dedicated = null; notes.push(`${name}: Windows reports exactly 4 GiB, which is a known cap; enter the real VRAM in Settings if it is wrong.`); }
    const kind = classifyGpuKind(name, vendor, dedicated);
    const bw = lookupGpuBandwidth(name);
    gpus.push({
      id: name, vendor, name, kind,
      dedicatedGiB: kind === "discrete" ? dedicated : null,
      freeGiB: null, sharedGiB: kind === "integrated" ? Math.max(0, Math.min(totalGiB * 0.5, totalGiB - 4)) : null,
      bandwidthGBps: bw ?? (kind === "discrete" && dedicated ? guessDiscreteBandwidth(dedicated) : null),
      bandwidthSource: bw ? "spec" : kind === "discrete" && dedicated ? "guess" : "unknown",
      accel: accelSupport(vendor, kind, "win32"), driver: g.DriverVersion ?? null,
    });
  }
  const bat = arr(raw.battery as { BatteryStatus?: number }[] | { BatteryStatus?: number } | null);
  // BatteryStatus 1 = discharging. 2 = on AC, 3..9 = charging/full/etc.
  const onBattery = bat.length ? bat.some((b) => b.BatteryStatus === 1) : null;
  return {
    platform: "win32", arch: raw.arch ?? "x64", osVersion: raw.os?.Caption ? `${raw.os.Caption.replace(/^Microsoft\s+/, "")} (${raw.os.Version ?? ""})`.trim() : "Windows",
    deviceModel: raw.system ? `${raw.system.Manufacturer ?? ""} ${raw.system.Model ?? ""}`.trim() || null : null,
    cpu: { name: cpuName, vendor: cpuVend, physicalCores: physical, logicalCores: logical, npu: npuFor(cpuName) },
    ram: { totalGiB, availableGiB: freeGiB, type: ramRow?.SMBIOSMemoryType ? SMBIOS[ramRow.SMBIOSMemoryType] ?? null : null, speedMTs: ramRow?.ConfiguredClockSpeed ?? ramRow?.Speed ?? null },
    gpus, unified: false, power: { onBattery }, diskFreeGiB: raw.diskFreeBytes ? raw.diskFreeBytes / GIB : null, notes,
  };
}

export interface MacRaw {
  chip?: string; cpuBrand?: string; memBytes?: number; physicalCores?: number; logicalCores?: number; gpuCores?: number | null;
  vmStat?: string; pageSize?: number; model?: string; osVersion?: string; arch?: string; translated?: boolean;
  wiredLimitMB?: number | null; onBattery?: boolean | null; diskFreeBytes?: number | null;
  /** Intel Macs: GPU names and VRAM from system_profiler. */
  displays?: Array<{ name?: string; vramMB?: number | null }>;
}

/** Free + inactive + speculative + purgeable pages ≈ what macOS can hand out without swapping. */
export function parseVmStat(text: string, pageSizeFallback = 16384): number {
  const ps = Number(/page size of (\d+) bytes/.exec(text)?.[1]) || pageSizeFallback;
  const pick = (label: string) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(text)?.[1] ?? 0);
  const pages = pick("Pages free") + pick("Pages inactive") + pick("Pages speculative") + pick("Pages purgeable");
  return (pages * ps) / GIB;
}

export function parseMac(raw: MacRaw): Omit<MachineProfile, "collectedAt" | "overrides" | "memProbe" | "notes"> & { notes: string[] } {
  const notes: string[] = [];
  const brand = (raw.cpuBrand ?? raw.chip ?? "Unknown").trim();
  const appleSilicon = /apple/i.test(brand) || raw.arch === "arm64" || !!raw.translated;
  const totalGiB = (raw.memBytes ?? 0) / GIB;
  const availableGiB = raw.vmStat ? parseVmStat(raw.vmStat, raw.pageSize) : totalGiB * 0.5;
  const physical = raw.physicalCores ?? null;
  const gpus: GpuInfo[] = [];
  let wired: number | null = null;
  if (appleSilicon) {
    const chip = brand.replace(/^Apple\s+/i, "Apple ");
    const bw = appleBandwidth(chip, raw.gpuCores);
    gpus.push({
      id: chip, vendor: "apple", name: chip, kind: "apple", dedicatedGiB: null, freeGiB: null, sharedGiB: totalGiB,
      bandwidthGBps: bw, bandwidthSource: bw ? "spec" : "unknown", accel: "yes", cores: raw.gpuCores ?? null,
    });
    wired = raw.wiredLimitMB && raw.wiredLimitMB > 0 ? raw.wiredLimitMB / 1024 : null;
  } else {
    for (const d of raw.displays ?? []) {
      if (!d.name) continue;
      const vendor = vendorFromText(d.name);
      const dedicated = d.vramMB ? d.vramMB / 1024 : null;
      const kind = classifyGpuKind(d.name, vendor, dedicated);
      const bw = lookupGpuBandwidth(d.name);
      gpus.push({ id: d.name, vendor, name: d.name, kind, dedicatedGiB: kind === "discrete" ? dedicated : null, freeGiB: null, sharedGiB: null, bandwidthGBps: bw, bandwidthSource: bw ? "spec" : "unknown", accel: accelSupport(vendor, kind, "darwin") });
    }
    notes.push("Intel Mac: local runtimes use the CPU; GPU acceleration is limited.");
  }
  if (raw.translated) notes.push("The app is running under Rosetta; install the Apple Silicon build for full speed.");
  return {
    platform: "darwin", arch: raw.arch ?? (appleSilicon ? "arm64" : "x64"), osVersion: raw.osVersion ? `macOS ${raw.osVersion}` : "macOS",
    deviceModel: raw.model ?? null,
    cpu: { name: brand, vendor: appleSilicon ? "apple" : cpuVendor(brand), physicalCores: physical, logicalCores: raw.logicalCores ?? physical ?? 4, npu: appleSilicon ? "apple-neural-engine" : null },
    ram: { totalGiB, availableGiB }, gpus, unified: appleSilicon, wiredLimitGiB: wired,
    power: { onBattery: raw.onBattery ?? null }, diskFreeGiB: raw.diskFreeBytes ? raw.diskFreeBytes / GIB : null, rosetta: !!raw.translated, notes,
  };
}

export function parseSysctlInt(text: string): number | null { const n = Number(text.trim()); return Number.isFinite(n) ? n : null; }

/** system_profiler SPDisplaysDataType -json */
export function parseMacDisplays(json: string): { gpuCores: number | null; displays: NonNullable<MacRaw["displays"]> } {
  try {
    const d = JSON.parse(json)?.SPDisplaysDataType ?? [];
    let cores: number | null = null;
    const displays = d.map((x: Record<string, string>) => {
      const c = Number(x.sppci_cores); if (Number.isFinite(c) && c > 0) cores = c;
      const vram = /(\d+)\s*(GB|MB)/i.exec(x.spdisplays_vram ?? x.spdisplays_vram_shared ?? "");
      return { name: x.sppci_model ?? x._name, vramMB: vram ? Number(vram[1]) * (vram[2].toUpperCase() === "GB" ? 1024 : 1) : null };
    });
    return { gpuCores: cores, displays };
  } catch { return { gpuCores: null, displays: [] }; }
}

export function parseLinux(raw: { cpuinfo: string; meminfo: string; gpusLspci: string; nvidiaSmi?: string; platformArch?: string; diskFreeBytes?: number | null; onBattery?: boolean | null }): Omit<MachineProfile, "collectedAt" | "overrides" | "memProbe"> {
  const name = /model name\s*:\s*(.+)/.exec(raw.cpuinfo)?.[1]?.trim() ?? "Unknown CPU";
  const logical = (raw.cpuinfo.match(/^processor\s*:/gm) ?? []).length || 4;
  const kb = (k: string) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(raw.meminfo)?.[1] ?? 0) * KIB / GIB;
  const gpus: GpuInfo[] = [];
  const smi = (raw.nvidiaSmi ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const l of smi) {
    const [n, total, free] = l.split(",").map((s) => s.trim());
    const name2 = n; const tot = Number(total) / 1024;
    if (!name2 || !Number.isFinite(tot)) continue;
    const bw = lookupGpuBandwidth(name2);
    gpus.push({ id: name2, vendor: "nvidia", name: name2, kind: "discrete", dedicatedGiB: tot, freeGiB: Number(free) / 1024, sharedGiB: null, bandwidthGBps: bw ?? guessDiscreteBandwidth(tot), bandwidthSource: bw ? "spec" : "guess", accel: "yes" });
  }
  if (!gpus.length) for (const l of raw.gpusLspci.split("\n")) {
    if (!/VGA|3D|Display/i.test(l)) continue;
    const n = l.replace(/^.*?:\s*/, "").replace(/^.*?controller:\s*/i, "");
    const vendor = vendorFromText(n); const kind = classifyGpuKind(n, vendor, null);
    const bw = lookupGpuBandwidth(n);
    gpus.push({ id: n, vendor, name: n, kind, dedicatedGiB: null, freeGiB: null, sharedGiB: null, bandwidthGBps: bw, bandwidthSource: bw ? "spec" : "unknown", accel: accelSupport(vendor, kind, "linux") });
  }
  return {
    platform: "linux", arch: raw.platformArch ?? "x64", osVersion: "Linux",
    cpu: { name, vendor: cpuVendor(name), physicalCores: null, logicalCores: logical, npu: npuFor(name) },
    ram: { totalGiB: kb("MemTotal"), availableGiB: kb("MemAvailable") }, gpus, unified: false,
    power: { onBattery: raw.onBattery ?? null }, diskFreeGiB: raw.diskFreeBytes ? raw.diskFreeBytes / GIB : null, notes: [],
  };
}
export type { Platform };
