import type { GpuInfo, MachineProfile } from "../src/shared/types";

export function gpu(partial: Partial<GpuInfo> & Pick<GpuInfo, "name" | "vendor" | "kind">): GpuInfo {
  return { id: partial.name, dedicatedGiB: null, freeGiB: null, sharedGiB: null, bandwidthGBps: null, bandwidthSource: "unknown", accel: "likely", ...partial };
}

export function machine(partial: Partial<MachineProfile> = {}): MachineProfile {
  return {
    collectedAt: "2026-10-13T00:00:00Z", platform: "win32", arch: "x64", osVersion: "Windows 11",
    cpu: { name: "Test CPU", vendor: "amd", physicalCores: 8, logicalCores: 16, npu: null },
    ram: { totalGiB: 16, availableGiB: 9 }, gpus: [], unified: false,
    power: { onBattery: false }, diskFreeGiB: 200, memProbe: { readGBps: 60, threads: 8, at: "now" },
    notes: [], overrides: {}, ...partial,
  };
}

/** MacBook Air M2, 16 GB. */
export const macM2 = (): MachineProfile => machine({
  platform: "darwin", arch: "arm64", osVersion: "macOS 15", unified: true,
  cpu: { name: "Apple M2", vendor: "apple", physicalCores: 8, logicalCores: 8, npu: "apple-neural-engine" },
  ram: { totalGiB: 16, availableGiB: 9 },
  gpus: [gpu({ name: "Apple M2", vendor: "apple", kind: "apple", bandwidthGBps: 100, bandwidthSource: "spec", accel: "yes", cores: 10 })],
  memProbe: { readGBps: 70, threads: 4, at: "now" },
});

/** Gaming laptop: RTX 4060 Laptop, 8 GB VRAM, 32 GB RAM. */
export const rtx4060Laptop = (): MachineProfile => machine({
  ram: { totalGiB: 32, availableGiB: 21 },
  gpus: [gpu({ name: "NVIDIA GeForce RTX 4060 Laptop GPU", vendor: "nvidia", kind: "discrete", dedicatedGiB: 8, freeGiB: 7.3, bandwidthGBps: 256, bandwidthSource: "spec", accel: "yes" })],
  memProbe: { readGBps: 55, threads: 8, at: "now" },
});

/** Ryzen AI thin-and-light: integrated Radeon 890M, 32 GB LPDDR5X. */
export const ryzenAi = (): MachineProfile => machine({
  cpu: { name: "AMD Ryzen AI 9 HX 370", vendor: "amd", physicalCores: 12, logicalCores: 24, npu: "ryzen-ai" },
  ram: { totalGiB: 32, availableGiB: 20 },
  gpus: [gpu({ name: "AMD Radeon(TM) 890M Graphics", vendor: "amd", kind: "integrated", dedicatedGiB: 0.5, sharedGiB: 16, accel: "maybe" })],
  memProbe: { readGBps: 85, threads: 12, at: "now" },
});

/** Office laptop: Intel iGPU, 8 GB RAM. */
export const office8 = (): MachineProfile => machine({
  cpu: { name: "Intel(R) Core(TM) i5-1235U", vendor: "intel", physicalCores: 10, logicalCores: 12, npu: null },
  ram: { totalGiB: 8, availableGiB: 3.9 },
  gpus: [gpu({ name: "Intel(R) Iris(R) Xe Graphics", vendor: "intel", kind: "integrated", dedicatedGiB: 0.125, sharedGiB: 4, accel: "maybe" })],
  memProbe: { readGBps: 30, threads: 8, at: "now" },
});

/** Strix Halo mini-workstation: 128 GB unified, big iGPU. */
export const strixHalo = (): MachineProfile => machine({
  cpu: { name: "AMD Ryzen AI Max+ 395", vendor: "amd", physicalCores: 16, logicalCores: 32, npu: "ryzen-ai" },
  ram: { totalGiB: 120, availableGiB: 100 },
  gpus: [gpu({ name: "AMD Radeon(TM) 8060S Graphics", vendor: "amd", kind: "integrated", dedicatedGiB: 32, sharedGiB: 60, bandwidthGBps: 256, bandwidthSource: "spec", accel: "likely" })],
  memProbe: { readGBps: 190, threads: 16, at: "now" },
});
