export interface GpuSpec {
  id: string;
  name: string;
  vram: number; // GB
  bw?: number; // GB/s memory bandwidth
}

export const GPUS: GpuSpec[] = [
  { id: "mi300x", name: "AMD Instinct MI300X (192 GB)", vram: 192, bw: 5300 },
  { id: "mi325x", name: "AMD Instinct MI325X (256 GB)", vram: 256, bw: 6000 },
  { id: "mi210", name: "AMD Instinct MI210 (64 GB)", vram: 64, bw: 1638 },
  { id: "7900xtx", name: "AMD Radeon RX 7900 XTX (24 GB)", vram: 24, bw: 960 },
  { id: "7900xt", name: "AMD Radeon RX 7900 XT (20 GB)", vram: 20, bw: 800 },
  { id: "7800xt", name: "AMD Radeon RX 7800 XT (16 GB)", vram: 16, bw: 624 },
  { id: "h100", name: "NVIDIA H100 SXM (80 GB)", vram: 80, bw: 3350 },
  { id: "a100-80", name: "NVIDIA A100 (80 GB)", vram: 80, bw: 2039 },
  { id: "a100-40", name: "NVIDIA A100 (40 GB)", vram: 40, bw: 1555 },
  { id: "rtx4090", name: "NVIDIA RTX 4090 (24 GB)", vram: 24, bw: 1008 },
  { id: "rtx3090", name: "NVIDIA RTX 3090 / 3090 Ti (24 GB)", vram: 24, bw: 936 },
  { id: "custom", name: "Custom VRAM amount...", vram: 24 },
];

export const gpuOptions = GPUS.map((g) => ({
  value: g.id,
  label: g.name,
}));
