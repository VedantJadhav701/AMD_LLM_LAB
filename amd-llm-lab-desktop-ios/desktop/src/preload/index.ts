import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { EVENT_CHANNELS, INVOKE_CHANNELS, type LabApi } from "../shared/ipc";

const invokeOk = new Set<string>(INVOKE_CHANNELS);
const eventOk = new Set<string>(EVENT_CHANNELS);

const api: LabApi = {
  invoke: (channel, arg) => {
    if (!invokeOk.has(channel)) return Promise.reject(new Error(`Blocked channel: ${String(channel)}`));
    return ipcRenderer.invoke(channel, arg).catch((e: Error) => { throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")); });
  },
  on: (channel, cb) => {
    if (!eventOk.has(channel)) throw new Error(`Blocked channel: ${String(channel)}`);
    const h = (_e: IpcRendererEvent, payload: unknown) => cb(payload as never);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
};
contextBridge.exposeInMainWorld("lab", api);
