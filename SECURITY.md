# Security Policy

The AMD LLM Lab team takes the security and privacy of our users very seriously. As a desktop application running on local user hardware with model downloads and local inference, we design every component with defense-in-depth principles.

---

## 🔒 Security Architecture Highlights

- **Loopback-Only Isolation**: The desktop app communicates solely over local loopback (`127.0.0.1` / `::1`) with model runtimes (Ollama, LM Studio, llama.cpp). Non-loopback network calls to runtimes are explicitly blocked.
- **Context Isolation & Sandbox**: Electron renderers run with `contextIsolation: true`, `nodeIntegration: false`, and communicate strictly through explicit IPC channels defined in `src/shared/ipc.ts`.
- **Zero Silent Telemetry**: All model fits, hardware detections, and benchmark results are stored strictly locally in `userData`. No telemetry or benchmark metrics are transmitted to any remote server without the user's explicit action and preview.
- **Path Traversal Protection**: Model operations and file deletions are strictly bounded within the designated application data models directory (`userData/models`).

---

## 🛡️ Supported Versions

We actively provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability within AMD LLM Lab, please **DO NOT** open a public issue. Instead, report it responsibly:

1. **Email**: Send details of the vulnerability to **vedantjadhav701@gmail.com** with the subject line `[SECURITY] AMD LLM Lab Vulnerability Report`.
2. **Details to include**:
   - Description of the vulnerability.
   - Steps to reproduce or proof of concept.
   - Potential impact and affected versions.
   - Your name or handle for security advisory credit (optional).

### Response Timeline
- We will acknowledge receipt of your vulnerability report within **48 hours**.
- We will provide a status update and fix timeline within **7 business days**.
- Once a fix is released, you will be credited in the security advisory (if desired).
