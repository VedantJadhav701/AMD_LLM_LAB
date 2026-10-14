import { deriveSpec, parseHfId, type DerivedSpec } from "../core/hfspec";

async function getJson(url: string, token?: string): Promise<unknown> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (res.status === 404) throw new Error("Model not found on Hugging Face.");
    if (res.status === 401 || res.status === 403) throw new Error("This model is gated or private. Accept its licence on Hugging Face first; the app does not sign in for you.");
    if (!res.ok) throw new Error(`Hugging Face returned ${res.status}.`);
    return await res.json();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Hugging Face did not answer in time. Check your connection.");
    if (e instanceof TypeError) throw new Error("Could not reach Hugging Face. You can still pick a model from the catalog while offline.");
    throw e;
  } finally { clearTimeout(t); }
}

/** Fetches only config.json and repository metadata (a few KB). No model files are downloaded. */
export async function lookupHf(input: string): Promise<DerivedSpec> {
  const id = parseHfId(input);
  if (!id) throw new Error("Enter a Hugging Face id like owner/name.");
  const [cfg, meta] = await Promise.all([
    getJson(`https://huggingface.co/${id}/resolve/main/config.json`),
    getJson(`https://huggingface.co/api/models/${id}`).catch(() => null),
  ]);
  const total = (meta as { safetensors?: { total?: number } } | null)?.safetensors?.total ?? null;
  const out = deriveSpec(id, cfg as Record<string, unknown>, total);
  if ("error" in out) throw new Error(out.error);
  return out;
}
