export function fmtGiB(n: number): string {
  return n >= 100 ? `${Math.round(n)} GB` : n >= 10 ? `${n.toFixed(1)} GB` : `${n.toFixed(2).replace(/0$/, "")} GB`;
}
export function fmtTok(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n >= 10 ? n.toFixed(0) : n.toFixed(1);
}
export function fmtRange(lo: number, hi: number): string {
  const a = fmtTok(lo), b = fmtTok(hi);
  return a === b ? a : `${a}–${b}`;
}
export function fmtCtx(n: number): string {
  return n >= 1024 && n % 1024 === 0 ? `${n / 1024}K` : n.toLocaleString();
}
