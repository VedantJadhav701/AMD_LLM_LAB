import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDirectory, "../../backend/data/amd_llm_lab_master.csv");
const outputPath = resolve(scriptDirectory, "../public/data/amd_llm_lab_master.json");
const numericColumns = new Set([
  "parameters_b", "context_tokens", "output_tokens", "latency_s", "generation_tok_s",
  "peak_vram_gb", "memory_per_billion_params_gb", "tokens_per_gb",
  "vram_utilization_pct", "gpu_vram_gb",
]);

const csv = await readFile(sourcePath, "utf8");
const [headers, ...rows] = parseCsv(csv.replace(/^\uFEFF/, ""));
if (!headers?.includes("source_file") || rows.length === 0) {
  throw new Error(`The measured benchmark source is missing or empty: ${sourcePath}`);
}

const records = rows.map((cells) => {
  const record = Object.fromEntries(headers.map((header, index) => {
    const value = cells[index] ?? "";
    if (value === "") return [header, null];
    if (numericColumns.has(header)) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) throw new Error(`Invalid numeric value in ${header}: ${value}`);
      return [header, numericValue];
    }
    return [header, value];
  }));
  return { ...record, source_type: "measured", source_id: "amd_llm_lab_master.csv" };
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(records)}\n`, "utf8");
process.stdout.write(`Generated ${records.length} public measured rows from the source CSV.\n`);

function parseCsv(input) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The measured benchmark CSV contains an unterminated quoted field.");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
