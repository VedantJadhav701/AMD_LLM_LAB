import { describe, expect, it } from "vitest";
import { parseLinux, parseMac, parseMacDisplays, parseVmStat, parseWindows } from "../src/main/detect/parse";

describe("windows parser", () => {
  it("reads a Ryzen AI laptop: integrated Radeon, DDR5/LPDDR5 RAM, NPU, on battery", () => {
    const p = parseWindows({
      cpu: { Name: "AMD Ryzen AI 9 HX 370 w/ Radeon 890M", NumberOfCores: 12, NumberOfLogicalProcessors: 24 },
      os: { Caption: "Microsoft Windows 11 Home", Version: "10.0.26100", TotalVisibleMemorySize: 32 * 1024 * 1024 - 1000, FreePhysicalMemory: 14 * 1024 * 1024 },
      gpus: [{ Name: "AMD Radeon(TM) 890M Graphics", AdapterRAM: 536870912, DriverVersion: "32.0.1" }],
      ram: [{ Speed: 7500, ConfiguredClockSpeed: 7500, SMBIOSMemoryType: 35 }],
      battery: [{ BatteryStatus: 1 }], system: { Manufacturer: "ASUS", Model: "Zenbook S 16" }, diskFreeBytes: 300 * 1024 ** 3,
    });
    expect(p.cpu.npu).toBe("ryzen-ai");
    expect(p.cpu.vendor).toBe("amd");
    expect(p.gpus).toHaveLength(1);
    expect(p.gpus[0].kind).toBe("integrated");
    expect(p.gpus[0].dedicatedGiB).toBeNull();
    expect(p.ram.type).toBe("LPDDR5");
    expect(p.ram.totalGiB).toBeCloseTo(32, 0);
    expect(p.power.onBattery).toBe(true);
    expect(p.diskFreeGiB).toBeCloseTo(300, 0);
  });
  it("uses the registry size when WMI AdapterRAM wraps at 4 GiB, and drops virtual adapters", () => {
    const p = parseWindows({
      cpu: [{ Name: "Intel(R) Core(TM) i7-13700H", NumberOfCores: 14, NumberOfLogicalProcessors: 20 }],
      os: { TotalVisibleMemorySize: 32 * 1024 * 1024, FreePhysicalMemory: 20 * 1024 * 1024 },
      gpus: [
        { Name: "Intel(R) Iris(R) Xe Graphics", AdapterRAM: 1073741824 },
        { Name: "NVIDIA GeForce RTX 4070 Laptop GPU", AdapterRAM: 4293918720, QwMemory: String(8 * 1024 ** 3) },
        { Name: "Microsoft Basic Render Driver" },
      ],
      battery: null,
    });
    expect(p.gpus.map((g) => g.name)).toEqual(["Intel(R) Iris(R) Xe Graphics", "NVIDIA GeForce RTX 4070 Laptop GPU"]);
    const n = p.gpus[1];
    expect(n.kind).toBe("discrete");
    expect(n.dedicatedGiB).toBeCloseTo(8, 1);
    expect(n.bandwidthGBps).toBe(256);
    expect(p.power.onBattery).toBeNull();
  });
  it("flags an unverifiable 4 GiB report instead of trusting it", () => {
    const p = parseWindows({ os: { TotalVisibleMemorySize: 16 * 1024 * 1024 }, gpus: [{ Name: "NVIDIA GeForce RTX 3080", AdapterRAM: 4293918720 }] });
    expect(p.gpus[0].dedicatedGiB).toBeNull();
    expect(p.notes.join(" ")).toMatch(/4 GiB/);
  });
});

describe("macOS parser", () => {
  const vm = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               20000.
Pages active:                            300000.
Pages inactive:                          200000.
Pages speculative:                         5000.
Pages purgeable:                          10000.`;
  it("computes available memory from vm_stat", () => {
    expect(parseVmStat(vm)).toBeCloseTo((235000 * 16384) / 1024 ** 3, 3);
  });
  it("reads an Apple Silicon MacBook and respects Rosetta and the wired limit", () => {
    const p = parseMac({ cpuBrand: "Apple M3 Pro", memBytes: 36 * 1024 ** 3, physicalCores: 11, logicalCores: 11, gpuCores: 18, vmStat: vm, arch: "arm64", osVersion: "15.1", onBattery: true, wiredLimitMB: 30000 });
    expect(p.unified).toBe(true);
    expect(p.gpus[0].kind).toBe("apple");
    expect(p.gpus[0].bandwidthGBps).toBe(150);
    expect(p.wiredLimitGiB).toBeCloseTo(29.3, 1);
    const r = parseMac({ cpuBrand: "Apple M2", memBytes: 16 * 1024 ** 3, translated: true, arch: "x64" });
    expect(r.rosetta).toBe(true);
    expect(r.unified).toBe(true);
    expect(r.notes.join(" ")).toMatch(/Rosetta/);
  });
  it("parses system_profiler JSON", () => {
    const j = JSON.stringify({ SPDisplaysDataType: [{ _name: "Apple M3 Pro", sppci_model: "Apple M3 Pro", sppci_cores: "18" }] });
    expect(parseMacDisplays(j).gpuCores).toBe(18);
    expect(parseMacDisplays("garbage")).toEqual({ gpuCores: null, displays: [] });
  });
});

describe("linux parser", () => {
  it("prefers nvidia-smi for VRAM", () => {
    const p = parseLinux({ cpuinfo: "processor : 0\nmodel name : AMD Ryzen 7 7840HS\nprocessor : 1\n", meminfo: "MemTotal: 33554432 kB\nMemAvailable: 16777216 kB", gpusLspci: "", nvidiaSmi: "NVIDIA GeForce RTX 4060 Laptop GPU, 8188, 7500\n" });
    expect(p.gpus[0].dedicatedGiB).toBeCloseTo(8, 0);
    expect(p.ram.availableGiB).toBeCloseTo(16, 0);
    expect(p.cpu.logicalCores).toBe(2);
  });
});

import { makeCalibration, median, placementKey, toQuantId } from "../src/core/calib";
import { machine, gpu } from "./fixtures";
describe("calibration helpers", () => {
  it("median ignores junk and handles even counts", () => {
    expect(median([3, 1, 2])).toBe(2); expect(median([1, 2, 3, 4])).toBe(2.5); expect(median([NaN])).toBeNull();
  });
  it("maps runtime quant labels to engine quants", () => {
    expect(toQuantId("Q4_K_M")).toBe("Q4_K_M"); expect(toQuantId("Q4_0")).toBe("Q4_K_M"); expect(toQuantId("F16")).toBe("F16"); expect(toQuantId(null)).toBe("Q4_K_M");
  });
  it("only calibrates a pool the run actually used", () => {
    const m = machine({ gpus: [gpu({ name: "NVIDIA RTX", vendor: "nvidia", kind: "discrete", accel: "yes" })] });
    expect(placementKey(m, { gpuFraction: 1, sizeGiB: 5, vramGiB: 5 })).toBe("gpu");
    expect(placementKey(m, { gpuFraction: 0, sizeGiB: 5, vramGiB: 0 })).toBe("cpu");
    expect(placementKey(m, { gpuFraction: 0.5, sizeGiB: 5, vramGiB: 2.5 })).toBeNull();
    expect(placementKey(machine(), { gpuFraction: null, sizeGiB: null, vramGiB: null })).toBe("cpu");
  });
  it("effective bandwidth is tok/s times bytes streamed", () => {
    const c = makeCalibration(40, 4, { model: "m", quant: "Q4_K_M", ctx: 4096, runtime: "x", at: "" });
    expect(c.effGBps).toBeCloseTo(40 * 4 * 1.0737, 1);
  });
});
