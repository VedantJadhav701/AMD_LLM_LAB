import type { AccelSupport, GpuKind, GpuVendor, MachineProfile, Platform } from "../shared/types";

// Published peak memory bandwidth in GB/s. Used only as a prior until the user runs the quick test.
// Laptop variants are listed before desktop ones because names overlap ("RTX 4060 Laptop GPU").
const SPECS: Array<[RegExp, number]> = [
  // NVIDIA
  [/RTX\s*5090.*Laptop/i, 896], [/RTX\s*5090/i, 1792],
  [/RTX\s*5080.*Laptop/i, 896], [/RTX\s*5080/i, 960],
  [/RTX\s*5070\s*Ti.*Laptop/i, 672], [/RTX\s*5070\s*Ti/i, 896],
  [/RTX\s*5070.*Laptop/i, 384], [/RTX\s*5070/i, 672],
  [/RTX\s*5060\s*Ti/i, 448], [/RTX\s*5060.*Laptop/i, 384], [/RTX\s*5060/i, 448],
  [/RTX\s*4090.*Laptop/i, 576], [/RTX\s*4090/i, 1008],
  [/RTX\s*4080.*Laptop/i, 384], [/RTX\s*4080\s*Super/i, 736], [/RTX\s*4080/i, 717],
  [/RTX\s*4070\s*Ti\s*Super/i, 672], [/RTX\s*4070\s*Ti/i, 504], [/RTX\s*4070\s*Super/i, 504],
  [/RTX\s*4070.*Laptop/i, 256], [/RTX\s*4070/i, 504],
  [/RTX\s*4060\s*Ti/i, 288], [/RTX\s*4060.*Laptop/i, 256], [/RTX\s*4060/i, 272],
  [/RTX\s*4050.*Laptop/i, 192],
  [/RTX\s*3090\s*Ti/i, 1008], [/RTX\s*3090/i, 936],
  [/RTX\s*3080\s*Ti/i, 912], [/RTX\s*3080/i, 760],
  [/RTX\s*3070.*Laptop/i, 448], [/RTX\s*3070/i, 448],
  [/RTX\s*3060\s*Ti/i, 448], [/RTX\s*3060.*Laptop/i, 336], [/RTX\s*3060/i, 360],
  [/RTX\s*3050\s*Ti.*Laptop/i, 192], [/RTX\s*3050.*Laptop/i, 192], [/RTX\s*3050\s*6GB/i, 168], [/RTX\s*3050/i, 224],
  // AMD discrete
  [/Radeon\s*AI\s*PRO\s*R9700/i, 640],
  [/RX\s*9070\s*XT/i, 640], [/RX\s*9070/i, 576], [/RX\s*9060\s*XT/i, 322],
  [/RX\s*7900\s*XTX/i, 960], [/RX\s*7900\s*XT\b/i, 800], [/RX\s*7900\s*GRE/i, 576], [/7900M/i, 576],
  [/RX\s*7800\s*XT/i, 624], [/RX\s*7700\s*XT/i, 432],
  [/7600M\s*XT|7700S/i, 288], [/7600S|7600M/i, 256], [/RX\s*7600/i, 288],
  [/RX\s*6950\s*XT/i, 576], [/RX\s*6900\s*XT/i, 512], [/RX\s*6800/i, 512], [/RX\s*6750\s*XT/i, 432],
  [/RX\s*6700\s*XT/i, 384], [/RX\s*6700/i, 320], [/RX\s*6650\s*XT/i, 280], [/RX\s*6600\s*XT/i, 256], [/RX\s*6600/i, 224],
  [/PRO\s*W7900/i, 864], [/PRO\s*W7800/i, 576],
  [/Instinct\s*MI325X/i, 6000], [/Instinct\s*MI300X/i, 5300], [/Instinct\s*MI250X/i, 3277], [/Instinct\s*MI210/i, 1638],
  // AMD Strix Halo integrated (soldered 256-bit LPDDR5X)
  [/(8060S|8050S)/i, 256],
  // Intel Arc discrete
  [/Arc.*B580/i, 456], [/Arc.*B570/i, 380], [/Arc.*A770/i, 560], [/Arc.*A750/i, 512],
];

export function lookupGpuBandwidth(name: string): number | null {
  for (const [re, bw] of SPECS) if (re.test(name)) return bw;
  return null;
}

/** Rough bandwidth for a discrete GPU of unknown model, from its memory size only. */
export function guessDiscreteBandwidth(vramGiB: number): number {
  if (vramGiB <= 4.5) return 128;
  if (vramGiB <= 6.5) return 192;
  if (vramGiB <= 8.5) return 256;
  if (vramGiB <= 12.5) return 360;
  if (vramGiB <= 16.5) return 450;
  if (vramGiB <= 24.5) return 800;
  return 1000;
}

/** Apple unified-memory bandwidth by chip name and GPU core count. */
export function appleBandwidth(chip: string, gpuCores?: number | null): number | null {
  const c = chip.toLowerCase();
  const m = /m([1-5])\s*(pro|max|ultra)?/.exec(c);
  if (!m) return null;
  const gen = Number(m[1]);
  const tier = m[2] ?? "base";
  const table: Record<number, Record<string, number>> = {
    1: { base: 68, pro: 200, max: 400, ultra: 800 },
    2: { base: 100, pro: 200, max: 400, ultra: 800 },
    3: { base: 100, pro: 150, max: 400, ultra: 819 },
    4: { base: 120, pro: 273, max: 546 },
    5: { base: 153 },
  };
  let bw = table[gen]?.[tier] ?? null;
  // Binned Max chips have a narrower memory bus.
  if (bw && tier === "max" && gpuCores) {
    if (gen === 2 && gpuCores <= 30) bw = 300;
    if (gen === 3 && gpuCores <= 30) bw = 300;
    if (gen === 4 && gpuCores <= 32) bw = 410;
  }
  return bw;
}

export function classifyGpuKind(name: string, vendor: GpuVendor, dedicatedGiB: number | null): GpuKind {
  if (vendor === "apple") return "apple";
  if (vendor === "nvidia") return "discrete";
  if (vendor === "amd") {
    if (/\b(RX|PRO|Instinct|FirePro)\b|\bW\d{4}\b|\bVII\b/i.test(name)) return "discrete";
    return "integrated";
  }
  if (vendor === "intel") return /Arc.*\b[AB]\d{3}/i.test(name) ? "discrete" : "integrated";
  return (dedicatedGiB ?? 0) >= 2 ? "discrete" : "integrated";
}

export function accelSupport(vendor: GpuVendor, kind: GpuKind, platform: Platform): AccelSupport {
  if (vendor === "apple") return "yes";
  if (vendor === "nvidia") return platform === "darwin" ? "no" : "yes";
  if (vendor === "amd") {
    if (platform === "darwin") return "maybe";
    return kind === "discrete" ? "likely" : "maybe";
  }
  if (vendor === "intel" || vendor === "qualcomm") return "maybe";
  return "no";
}

export function vendorFromText(text: string): GpuVendor {
  const t = text.toLowerCase();
  if (/nvidia|geforce|quadro|\brtx\b/.test(t)) return "nvidia";
  if (/\bamd\b|radeon|instinct|ati\b/.test(t)) return "amd";
  if (/apple/.test(t)) return "apple";
  if (/intel|arc\(tm\)|iris|uhd/.test(t)) return "intel";
  if (/qualcomm|adreno/.test(t)) return "qualcomm";
  return "other";
}

export function cpuVendor(name: string): MachineProfile["cpu"]["vendor"] {
  const t = name.toLowerCase();
  if (/apple/.test(t)) return "apple";
  if (/amd|ryzen|epyc|threadripper/.test(t)) return "amd";
  if (/intel|core\(tm\)|xeon|celeron|pentium/.test(t)) return "intel";
  if (/snapdragon|qualcomm/.test(t)) return "qualcomm";
  return "other";
}

export function npuFor(cpuName: string): MachineProfile["cpu"]["npu"] {
  if (/Ryzen\s+AI/i.test(cpuName)) return "ryzen-ai";
  if (/Core\s+Ultra/i.test(cpuName)) return "intel-ai-boost";
  if (/Apple\s+M\d/i.test(cpuName)) return "apple-neural-engine";
  if (/Snapdragon/i.test(cpuName)) return "snapdragon";
  return null;
}

/** Quant-independent efficiency: the share of peak memory bandwidth llama.cpp-style decoding reaches.
 *  Efficiency falls as bandwidth rises because small kernels stop saturating wide memory systems.
 *  Reference points used to shape these curves are listed in README (Accuracy). */
export function gpuEfficiency(vendor: GpuVendor, kind: GpuKind, bwGBps: number): [number, number] {
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  if (vendor === "apple") {
    const mid = clamp(0.88 - 0.00055 * bwGBps, 0.35, 0.9);
    return [mid * 0.78, Math.min(0.95, mid * 1.1)];
  }
  if (vendor === "nvidia") {
    const mid = clamp(0.92 - 0.00038 * bwGBps, 0.35, 0.9);
    return [mid * 0.8, Math.min(0.95, mid * 1.2)];
  }
  if (vendor === "amd" && kind === "discrete") {
    const mid = clamp(0.8 - 0.00038 * bwGBps, 0.3, 0.8);
    return [mid * 0.75, mid * 1.15];
  }
  if (kind === "integrated") return [0.4, 0.8];
  return [0.25, 0.6];
}

export const CPU_EFFICIENCY: [number, number] = [0.4, 0.85];
export const CPU_GUESS_GBPS = 45;
