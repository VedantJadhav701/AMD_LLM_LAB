import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("amdLlmLab", {
  platform: process.platform,
  apiUrl: `http://127.0.0.1:${process.env.AMD_LLM_LAB_API_PORT ?? 8000}`,
});
