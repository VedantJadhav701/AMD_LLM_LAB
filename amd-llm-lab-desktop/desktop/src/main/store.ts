import { promises as fs } from "node:fs";
import path from "node:path";

/** Small JSON file with atomic writes. A corrupt file is moved aside instead of crashing the app. */
export class JsonStore<T> {
  private cache: T | null = null;
  private queue: Promise<void> = Promise.resolve();
  constructor(private file: string, private fallback: () => T) {}

  async read(): Promise<T> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, "utf8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") await fs.rename(this.file, `${this.file}.corrupt-${Date.now()}`).catch(() => undefined);
      this.cache = this.fallback();
    }
    return this.cache;
  }

  write(value: T): Promise<void> {
    this.cache = value;
    this.queue = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
      await fs.rename(tmp, this.file);
    }).catch(() => undefined);
    return this.queue;
  }

  async update(fn: (v: T) => T): Promise<T> { const next = fn(await this.read()); await this.write(next); return next; }
}
