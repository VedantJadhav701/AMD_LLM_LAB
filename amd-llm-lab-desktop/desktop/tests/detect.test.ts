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
  it("detects a real HP Victus gaming laptop: Intel i5-12450H with RTX 3050 Laptop GPU and UHD Graphics", () => {
    const p = parseWindows({
      cpu: [{ Name: "12th Gen Intel(R) Core(TM) i5-12450H", NumberOfCores: 8, NumberOfLogicalProcessors: 12 }],
      os: { Caption: "Microsoft Windows 11 Home Single Language", Version: "10.0.26200", TotalVisibleMemorySize: 16437648, FreePhysicalMemory: 2384104 },
      gpus: [
        { Name: "NVIDIA GeForce RTX 3050 Laptop GPU", AdapterRAM: 4293918720, QwMemory: "4294967296", DriverVersion: "32.0.16.1692" },
        { Name: "Intel(R) UHD Graphics", AdapterRAM: 1073741824, DriverVersion: "31.0.101.4502" },
      ],
      ram: [{ Speed: 3200, ConfiguredClockSpeed: 3200, SMBIOSMemoryType: 26 }],
      battery: [{ BatteryStatus: 1 }],
      system: { Manufacturer: "HP", Model: "Victus by HP Gaming Laptop 15-fa0xxx" },
      diskFreeBytes: 205608620032,
    });
    expect(p.deviceModel).toBe("HP Victus by HP Gaming Laptop 15-fa0xxx");
    expect(p.cpu.vendor).toBe("intel");
    expect(p.gpus).toHaveLength(2);
    const dgpu = p.gpus[0];
    expect(dgpu.name).toBe("NVIDIA GeForce RTX 3050 Laptop GPU");
    expect(dgpu.kind).toBe("discrete");
    expect(dgpu.dedicatedGiB).toBe(4);
    expect(dgpu.bandwidthGBps).toBe(192);
    expect(dgpu.bandwidthSource).toBe("spec");
    expect(p.power.onBattery).toBe(true);
    expect(p.ram.type).toBe("DDR4");
  });
  it("detects AMD Strix Halo (Ryzen AI Max+ 395) with Radeon 8060S 256-bit memory", () => {
    const p = parseWindows({
      cpu: [{ Name: "AMD Ryzen AI Max+ 395 w/ Radeon 8060S", NumberOfCores: 16, NumberOfLogicalProcessors: 32 }],
      os: { Caption: "Microsoft Windows 11 Pro", Version: "10.0.26100", TotalVisibleMemorySize: 128 * 1024 * 1024, FreePhysicalMemory: 100 * 1024 * 1024 },
      gpus: [
        { Name: "AMD Radeon(TM) 8060S Graphics", AdapterRAM: 2147483648, QwMemory: String(32 * 1024 ** 3), DriverVersion: "32.0.1" },
      ],
      ram: [{ Speed: 8533, ConfiguredClockSpeed: 8533, SMBIOSMemoryType: 35 }],
      system: { Manufacturer: "Framework", Model: "Desktop" },
    });
    expect(p.cpu.npu).toBe("ryzen-ai");
    expect(p.gpus[0].bandwidthGBps).toBe(256);
    expect(p.gpus[0].bandwidthSource).toBe("spec");
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
  it("detects Apple M4 Max with 40-core GPU (546 GB/s) and binned 32-core GPU (410 GB/s)", () => {
    const full = parseMac({ cpuBrand: "Apple M4 Max", memBytes: 64 * 1024 ** 3, physicalCores: 16, logicalCores: 16, gpuCores: 40, arch: "arm64", osVersion: "15.3" });
    expect(full.gpus[0].bandwidthGBps).toBe(546);
    expect(full.gpus[0].bandwidthSource).toBe("spec");
    const binned = parseMac({ cpuBrand: "Apple M4 Max", memBytes: 36 * 1024 ** 3, physicalCores: 14, logicalCores: 14, gpuCores: 32, arch: "arm64", osVersion: "15.3" });
    expect(binned.gpus[0].bandwidthGBps).toBe(410);
  });
  it("detects Apple M1 base, M1 Pro, and M1 Max memory bandwidth tiers", () => {
    const m1 = parseMac({ cpuBrand: "Apple M1", memBytes: 8 * 1024 ** 3, physicalCores: 8, logicalCores: 8, arch: "arm64", osVersion: "14.5" });
    expect(m1.gpus[0].bandwidthGBps).toBe(68);
    const m1pro = parseMac({ cpuBrand: "Apple M1 Pro", memBytes: 32 * 1024 ** 3, physicalCores: 10, logicalCores: 10, arch: "arm64", osVersion: "14.5" });
    expect(m1pro.gpus[0].bandwidthGBps).toBe(200);
    const m1max = parseMac({ cpuBrand: "Apple M1 Max", memBytes: 64 * 1024 ** 3, physicalCores: 10, logicalCores: 10, arch: "arm64", osVersion: "14.5" });
    expect(m1max.gpus[0].bandwidthGBps).toBe(400);
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
