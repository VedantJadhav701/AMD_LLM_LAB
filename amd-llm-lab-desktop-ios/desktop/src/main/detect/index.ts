import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import type { MachineProfile } from "../../shared/types";
import { parseLinux, parseMac, parseMacDisplays, parseSysctlInt, parseWindows, type MacRaw, type WinRaw } from "./parse";
import { probeMemoryBandwidth } from "../memprobe";

const run = promisify(execFile);
async function sh(cmd: string, args: string[], timeout = 15000): Promise<string> {
  try { return (await run(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true })).stdout; } catch { return ""; }
}

// One PowerShell round trip; every section is optional so a missing WMI class cannot break detection.
const PS = String.raw`
$ErrorActionPreference='SilentlyContinue'
function Q($c){ Get-CimInstance $c | Select-Object * }
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { [pscustomobject]@{Name=$_.Name;AdapterRAM=$_.AdapterRAM;DriverVersion=$_.DriverVersion;PNP=$_.PNPDeviceID} })
$key='HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
$reg = @(Get-ChildItem $key | ForEach-Object { $p=Get-ItemProperty $_.PSPath; if($p.DriverDesc){ [pscustomobject]@{Name=$p.DriverDesc;Qw=$p.'HardwareInformation.qwMemorySize'} } })
foreach($g in $gpus){ $m=$reg | Where-Object { $_.Name -eq $g.Name } | Select-Object -First 1; $g | Add-Member -NotePropertyName QwMemory -NotePropertyValue ($(if($m -and $m.Qw){[string][uint64]$m.Qw}else{$null})) -Force }
$sys = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model
$drive = (Get-Item $env:SystemDrive).PSDrive
@{
 cpu = @(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors)
 os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,FreePhysicalMemory,TotalVisibleMemorySize
 gpus = $gpus
 ram = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Speed,ConfiguredClockSpeed,SMBIOSMemoryType)
 battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus)
 system = $sys
 diskFreeBytes = (Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':'))).Free
 arch = $env:PROCESSOR_ARCHITECTURE
} | ConvertTo-Json -Depth 5 -Compress`;

async function detectWindows(): Promise<ReturnType<typeof parseWindows>> {
  const out = await sh("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS], 30000);
  let raw: WinRaw = {};
  try { raw = JSON.parse(out); } catch { /* fall through to Node fallback */ }
  if (!raw.os) {
    const cpus = os.cpus();
    raw = { cpu: { Name: cpus[0]?.model, NumberOfLogicalProcessors: cpus.length }, os: { TotalVisibleMemorySize: os.totalmem() / 1024, FreePhysicalMemory: os.freemem() / 1024 }, gpus: [] };
  }
  raw.arch = os.arch();
  const p = parseWindows(raw);
  if (!out) p.notes.push("Detailed hardware query failed; showing basic info only. You can enter your GPU memory in Settings.");
  return p;
}

async function detectMac(): Promise<ReturnType<typeof parseMac>> {
  const [brand, mem, phys, logi, vm, model, ver, gpuJson, trans, wired, batt, df] = await Promise.all([
    sh("sysctl", ["-n", "machdep.cpu.brand_string"]), sh("sysctl", ["-n", "hw.memsize"]), sh("sysctl", ["-n", "hw.physicalcpu"]), sh("sysctl", ["-n", "hw.logicalcpu"]),
    sh("vm_stat", []), sh("sysctl", ["-n", "hw.model"]), sh("sw_vers", ["-productVersion"]),
    sh("system_profiler", ["SPDisplaysDataType", "-json"], 20000), sh("sysctl", ["-n", "sysctl.proc_translated"]),
    sh("sysctl", ["-n", "iogpu.wired_limit_mb"]), sh("pmset", ["-g", "batt"]), sh("df", ["-k", "/"]),
  ]);
  const g = parseMacDisplays(gpuJson);
  const freeKB = Number(df.split("\n")[1]?.trim().split(/\s+/)[3]);
  const raw: MacRaw = {
    cpuBrand: brand.trim() || undefined, memBytes: parseSysctlInt(mem) ?? os.totalmem(), physicalCores: parseSysctlInt(phys) ?? undefined, logicalCores: parseSysctlInt(logi) ?? os.cpus().length,
    gpuCores: g.gpuCores, displays: g.displays, vmStat: vm || undefined, model: model.trim() || undefined, osVersion: ver.trim(), arch: process.arch,
    translated: trans.trim() === "1", wiredLimitMB: parseSysctlInt(wired), onBattery: batt ? /Battery Power/.test(batt) : null, diskFreeBytes: Number.isFinite(freeKB) ? freeKB * 1024 : null,
  };
  // Under Rosetta the brand string says "Apple processor" or is Intel-like; trust the translated flag.
  if (raw.translated && !/apple/i.test(raw.cpuBrand ?? "")) raw.cpuBrand = (await sh("sysctl", ["-n", "machdep.cpu.brand_string"])).trim();
  return parseMac(raw);
}

async function detectLinux(): Promise<MachineProfile> {
  const rd = (p: string) => fs.readFile(p, "utf8").catch(() => "");
  const [cpuinfo, meminfo, lspci, smi] = await Promise.all([rd("/proc/cpuinfo"), rd("/proc/meminfo"), sh("lspci", []), sh("nvidia-smi", ["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"])]);
  const st = await fs.statfs(os.homedir()).catch(() => null);
  const p = parseLinux({ cpuinfo, meminfo, gpusLspci: lspci, nvidiaSmi: smi, platformArch: os.arch(), diskFreeBytes: st ? st.bavail * st.bsize : null });
  return { ...p, collectedAt: "", overrides: {}, notes: p.notes };
}

export async function detectMachine(withProbe = true): Promise<MachineProfile> {
  let base: Omit<MachineProfile, "collectedAt" | "overrides" | "memProbe">;
  try {
    base = process.platform === "win32" ? await detectWindows() : process.platform === "darwin" ? await detectMac() : await detectLinux();
  } catch (e) {
    const cpus = os.cpus();
    base = { platform: process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux", arch: os.arch(), osVersion: os.release(), cpu: { name: cpus[0]?.model ?? "Unknown CPU", vendor: "other", physicalCores: null, logicalCores: cpus.length, npu: null }, ram: { totalGiB: os.totalmem() / 1024 ** 3, availableGiB: os.freemem() / 1024 ** 3 }, gpus: [], unified: false, power: { onBattery: null }, diskFreeGiB: null, notes: [`Hardware detection failed (${(e as Error).message}). Showing basic info.`] };
  }
  // Windows/Linux free memory can be taken from Node directly if the OS query returned nothing useful.
  if (!(base.ram.availableGiB > 0)) base.ram.availableGiB = os.freemem() / 1024 ** 3;
  if (!(base.ram.totalGiB > 0)) base.ram.totalGiB = os.totalmem() / 1024 ** 3;
  const probe = withProbe ? await probeMemoryBandwidth().catch(() => null) : null;
  return { ...base, collectedAt: new Date().toISOString(), memProbe: probe, overrides: {}, notes: base.notes ?? [] };
}
