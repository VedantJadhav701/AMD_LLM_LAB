// A tiny stand-in for Ollama's HTTP API, used by tests and the e2e run. Speeds are fake and fixed.
import http from "node:http";
export function startMockOllama(port = 11434, { tokS = 40, gpuFraction = 1 } = {}) {
  const models = [
    { name: "llama3.1:8b", size: 4.9 * 1024 ** 3, details: { parameter_size: "8.0B", quantization_level: "Q4_K_M", family: "llama" } },
    { name: "qwen2.5:3b", size: 1.9 * 1024 ** 3, details: { parameter_size: "3.1B", quantization_level: "Q4_K_M", family: "qwen2" } },
  ];
  const server = http.createServer(async (req, res) => {
    const body = await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b ? JSON.parse(b) : {})); });
    const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/api/version") return json({ version: "0.0.0-mock" });
    if (req.url === "/api/tags") return json({ models });
    if (req.url === "/api/ps") { const m = models[0]; return json({ models: [{ name: m.name, size: m.size, size_vram: m.size * gpuFraction }] }); }
    if (req.url === "/api/generate") return json({ done: true });
    if (req.url === "/api/create") {
      if (body.name) {
        models.push({
          name: body.name,
          size: 2 * 1024 ** 3,
          details: { parameter_size: "1.0B", quantization_level: "Q8_0", family: "mock" },
        });
      }
      return json({ status: "success" });
    }
    if (req.url === "/api/pull") {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      for (let i = 1; i <= 4; i++) res.write(JSON.stringify({ status: "pulling", completed: i * 25, total: 100 }) + "\n");
      return res.end(JSON.stringify({ status: "success" }) + "\n");
    }
    if (req.url === "/api/chat") {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      const n = body.options?.num_predict > 0 ? Math.min(body.options.num_predict, 160) : 60;
      const words = "Local models are fun to test. ".split(" ");
      const interval = 1000 / tokS;
      let i = 0;
      const t = setInterval(() => {
        if (i < n) { res.write(JSON.stringify({ message: { role: "assistant", content: words[i % words.length] + " " }, done: false }) + "\n"); i++; return; }
        clearInterval(t);
        res.end(JSON.stringify({ done: true, eval_count: n, eval_duration: (n / tokS) * 1e9, prompt_eval_count: 40, prompt_eval_duration: 5e7, load_duration: 2e8, total_duration: 1e9 }) + "\n");
      }, interval);
      req.on("close", () => clearInterval(t));
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
if (process.argv[1]?.endsWith("mock-ollama.mjs")) { await startMockOllama(Number(process.argv[2] ?? 11434)); console.log("mock ollama up"); }
