"""Community benchmark hub: accept, check, store and rank real LLM runs from any AMD machine.

Storage is SQLite (stdlib). Every run is labelled by who vouches for it:
  verified  - maintainer-checked, including the seeded MI300X reference runs
  community - accepted from the public API, passed the plausibility checks
  suspect   - failed a physics check (kept for review, excluded from rankings)
  hidden    - removed by a maintainer
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import sqlite3
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, model_validator

from src.fit import BYTES_PER_WEIGHT, HF_ID

router = APIRouter(tags=["hub"])

# Published peak memory bandwidth (GB/s), used only for the roofline-efficiency check.
KNOWN_BANDWIDTH_GBPS = {
    "mi325x": 6000, "mi300x": 5300, "mi210": 1638,
    "7900 xtx": 960, "7900 xt": 800, "7800 xt": 624, "9070 xt": 640,
}
Status = Literal["verified", "community", "suspect", "hidden"]


class Hardware(BaseModel):
    model_config = {"extra": "forbid"}
    gpu_name: str = Field(..., min_length=2, max_length=80)
    vram_gb: float = Field(..., gt=0, le=4096)
    arch: Optional[str] = Field(None, max_length=40)
    rocm_version: Optional[str] = Field(None, max_length=40)
    driver: Optional[str] = Field(None, max_length=60)
    os: Optional[str] = Field(None, max_length=60)
    memory_bandwidth_gbps: Optional[float] = Field(None, gt=0, le=100_000)


class Software(BaseModel):
    model_config = {"extra": "forbid"}
    stack: str = Field(..., min_length=1, max_length=40, description="transformers, vllm, llama.cpp, sglang ...")
    stack_version: Optional[str] = Field(None, max_length=40)
    torch_version: Optional[str] = Field(None, max_length=60)


class ModelInfo(BaseModel):
    model_config = {"extra": "forbid"}
    hf_model_id: str
    params_b: float = Field(..., gt=0, le=2000)
    precision: str = Field(..., min_length=2, max_length=16)
    quantization: Optional[str] = Field(None, max_length=40)

    @model_validator(mode="after")
    def _check(self):
        if not HF_ID.match(self.hf_model_id):
            raise ValueError("hf_model_id must look like 'owner/name'")
        self.precision = self.precision.upper()
        return self


class RunConfig(BaseModel):
    model_config = {"extra": "forbid"}
    batch_size: int = Field(1, ge=1, le=1024)
    context_tokens: int = Field(..., ge=1, le=2_000_000)
    output_tokens: int = Field(..., ge=1, le=8192)


class Results(BaseModel):
    model_config = {"extra": "forbid"}
    load_peak_vram_gb: Optional[float] = Field(None, ge=0, description="Peak while loading/quantizing")
    steady_vram_gb: Optional[float] = Field(None, ge=0, description="Allocated after load, before generation")
    run_peak_vram_gb: Optional[float] = Field(None, ge=0, description="Peak during prefill + decode")
    decode_tok_s: Optional[float] = Field(None, gt=0, le=1_000_000, description="Aggregate decode tokens/s across the batch")
    prefill_tok_s: Optional[float] = Field(None, gt=0, le=10_000_000)
    ttft_s: Optional[float] = Field(None, gt=0, le=3600)


class Submission(BaseModel):
    model_config = {"extra": "forbid"}
    client_version: str = Field(..., min_length=1, max_length=20)
    hardware: Hardware
    software: Software
    model: ModelInfo
    run: RunConfig
    outcome: Literal["ok", "oom"] = "ok"
    results: Results = Results()
    notes: Optional[str] = Field(None, max_length=280)

    @model_validator(mode="after")
    def _physical(self):
        r, cap = self.results, self.hardware.vram_gb * 1.02
        if self.outcome == "ok":
            if r.decode_tok_s is None:
                raise ValueError("an 'ok' run needs results.decode_tok_s")
            if not any(v is not None for v in (r.load_peak_vram_gb, r.steady_vram_gb, r.run_peak_vram_gb)):
                raise ValueError("an 'ok' run needs at least one memory measurement")
        for name in ("load_peak_vram_gb", "steady_vram_gb", "run_peak_vram_gb"):
            value = getattr(r, name)
            if value is not None and value > cap:
                raise ValueError(f"{name} ({value} GB) is larger than the GPU's {self.hardware.vram_gb} GB")
        return self


class SubmissionOut(BaseModel):
    id: str
    status: Status
    created_at: str
    reference: bool
    efficiency: Optional[float] = Field(None, description="Share of peak memory bandwidth used while decoding")
    reasons: list[str] = []
    submission: Submission


class Receipt(BaseModel):
    id: str
    status: Status
    duplicate: bool = False
    efficiency: Optional[float] = None
    reasons: list[str] = []


# ---------------------------------------------------------------- storage

def db_path() -> Path:
    return Path(os.getenv("AMD_LLM_LAB_DB") or Path(__file__).resolve().parent.parent / "data" / "hub.sqlite")


@contextmanager
def connect():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS submissions(
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL, reference INTEGER NOT NULL DEFAULT 0,
        gpu TEXT, model TEXT, precision TEXT, stack TEXT, batch INTEGER, context INTEGER, outcome TEXT,
        decode_tok_s REAL, steady_vram_gb REAL, load_peak_vram_gb REAL, efficiency REAL,
        reasons TEXT NOT NULL DEFAULT '[]', payload TEXT NOT NULL)""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sub_lookup ON submissions(status, model, context, gpu)")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def bandwidth_for(hw: Hardware) -> Optional[float]:
    if hw.memory_bandwidth_gbps:
        return hw.memory_bandwidth_gbps
    name = hw.gpu_name.lower()
    return next((bw for key, bw in KNOWN_BANDWIDTH_GBPS.items() if key in name), None)


def assess(sub: Submission) -> tuple[Status, Optional[float], list[str]]:
    """Physics checks. A decode loop cannot beat memory bandwidth or hold less than its own weights."""
    reasons: list[str] = []
    efficiency = None
    bytes_per = BYTES_PER_WEIGHT.get(sub.model.precision)
    weights_gb = sub.model.params_b * bytes_per if bytes_per else None
    bandwidth = bandwidth_for(sub.hardware)
    r = sub.results
    if sub.outcome == "ok" and weights_gb and bandwidth and r.decode_tok_s:
        efficiency = round((r.decode_tok_s / sub.run.batch_size) * weights_gb / bandwidth, 4)
        if efficiency > 1.15:
            reasons.append("Decode speed is above the GPU's memory-bandwidth limit.")
    memory = r.steady_vram_gb if r.steady_vram_gb is not None else r.run_peak_vram_gb
    if weights_gb and memory is not None and memory < 0.8 * weights_gb:
        reasons.append("Reported memory is smaller than the model's weights.")
    return ("suspect" if reasons else "community"), efficiency, reasons


def _row_values(sub: Submission, status: Status, efficiency, reasons, reference: bool, sid: str, when: str):
    r = sub.results
    return (sid, when, status, int(reference), sub.hardware.gpu_name, sub.model.hf_model_id, sub.model.precision,
            sub.software.stack, sub.run.batch_size, sub.run.context_tokens, sub.outcome, r.decode_tok_s,
            r.steady_vram_gb, r.load_peak_vram_gb, efficiency, json.dumps(reasons),
            sub.model_dump_json(exclude_none=True))


INSERT = "INSERT OR IGNORE INTO submissions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"


def _submission_id(sub: Submission) -> str:
    return hashlib.sha256(sub.model_dump_json(exclude_none=True).encode()).hexdigest()[:16]


def seed_reference(csv_path: Path) -> int:
    """Load the original MI300X dataset as verified reference runs. Safe to call repeatedly."""
    import pandas as pd

    if not Path(csv_path).exists():
        return 0
    frame = pd.read_csv(csv_path)
    added = 0
    with connect() as conn:
        for row in frame.itertuples():
            sub = Submission(
                client_version="reference-1",
                hardware=Hardware(gpu_name=str(row.gpu), vram_gb=float(row.gpu_vram_gb), arch="gfx942"),
                software=Software(stack="transformers"),
                model=ModelInfo(hf_model_id=str(row.model), params_b=float(row.parameters_b),
                                precision=str(row.precision), quantization=str(row.quantization)),
                run=RunConfig(batch_size=1, context_tokens=int(row.context_tokens), output_tokens=int(row.output_tokens)),
                results=Results(run_peak_vram_gb=float(row.peak_vram_gb), decode_tok_s=float(row.generation_tok_s)),
                notes=f"Reference run, backend: {row.backend}. Memory is the run peak, which for quantized models includes loading.",
            )
            _, efficiency, _ = assess(sub)
            cursor = conn.execute(INSERT, _row_values(sub, "verified", efficiency, [], True, _submission_id(sub),
                                                      datetime.now(timezone.utc).isoformat()))
            added += cursor.rowcount
    return added


def measured_speed(gpu_like: str, model_id: str, precision: str, context: int, batch: int = 1) -> Optional[dict]:
    """Median decode speed from accepted runs on a matching GPU, or None. Used by the advisor."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT decode_tok_s, status, stack FROM submissions WHERE outcome='ok' AND status IN ('verified','community') "
            "AND gpu LIKE ? AND model=? AND precision=? AND context=? AND batch=?",
            (f"%{gpu_like}%", model_id, precision.upper(), context, batch)).fetchall()
    if not rows:
        return None
    return {"tok_s": round(median(r["decode_tok_s"] for r in rows), 2), "runs": len(rows),
            "verified": any(r["status"] == "verified" for r in rows), "stacks": sorted({r["stack"] for r in rows})}


# ---------------------------------------------------------------- rate limit

_hits: dict[str, deque] = defaultdict(deque)


def _rate_limit(request: Request):
    limit = int(os.getenv("AMD_LLM_LAB_SUBMIT_LIMIT", "60"))
    who = request.client.host if request.client else "unknown"
    now, window = time.time(), _hits[who]
    while window and window[0] < now - 3600:
        window.popleft()
    if len(window) >= limit:
        raise HTTPException(status_code=429, detail="Too many submissions from this address. Try again in an hour.")
    window.append(now)


# ---------------------------------------------------------------- routes

@router.post("/submissions", response_model=Receipt, status_code=201)
def submit(submission: Submission, request: Request, response: Response):
    _rate_limit(request)
    status, efficiency, reasons = assess(submission)
    sid = _submission_id(submission)
    with connect() as conn:
        inserted = conn.execute(INSERT, _row_values(
            submission, status, efficiency, reasons, False, sid, datetime.now(timezone.utc).isoformat())).rowcount
        if not inserted:
            response.status_code = 200
            existing = conn.execute("SELECT status, efficiency FROM submissions WHERE id=?", (sid,)).fetchone()
            return Receipt(id=sid, status=existing["status"], duplicate=True, efficiency=existing["efficiency"])
    return Receipt(id=sid, status=status, efficiency=efficiency, reasons=reasons)


def _out(row: sqlite3.Row) -> SubmissionOut:
    return SubmissionOut(id=row["id"], status=row["status"], created_at=row["created_at"],
                         reference=bool(row["reference"]), efficiency=row["efficiency"],
                         reasons=json.loads(row["reasons"]), submission=Submission.model_validate_json(row["payload"]))


@router.get("/submissions", response_model=list[SubmissionOut])
def list_submissions(
    response: Response,
    gpu: Optional[str] = Query(None, max_length=80), model: Optional[str] = Query(None, max_length=100),
    stack: Optional[str] = Query(None, max_length=40), precision: Optional[str] = Query(None, max_length=16),
    include_suspect: bool = False, limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
):
    where, args = ["status != 'hidden'"], []
    if not include_suspect:
        where.append("status != 'suspect'")
    for column, value in (("gpu", gpu), ("model", model), ("stack", stack), ("precision", precision and precision.upper())):
        if value:
            where.append(f"{column} LIKE ?")
            args.append(f"%{value}%")
    clause = " AND ".join(where)
    with connect() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM submissions WHERE {clause}", args).fetchone()[0]
        rows = conn.execute(f"SELECT * FROM submissions WHERE {clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                            [*args, limit, offset]).fetchall()
    response.headers["X-Total-Count"] = str(total)
    return [_out(row) for row in rows]


class LeaderboardRow(BaseModel):
    gpu: str
    stack: str
    model: str
    precision: str
    runs: int
    decode_tok_s: float = Field(..., description="Median aggregate decode tokens/s")
    best_decode_tok_s: float
    steady_vram_gb: Optional[float] = None
    run_peak_vram_gb: Optional[float] = None
    efficiency: Optional[float] = None
    verified: bool


@router.get("/leaderboard", response_model=list[LeaderboardRow])
def leaderboard(model: Optional[str] = Query(None, max_length=100), context: int = Query(2048, ge=1),
                batch: int = Query(1, ge=1)):
    sql = "SELECT * FROM submissions WHERE outcome='ok' AND status IN ('verified','community') AND context=? AND batch=?"
    args: list[Any] = [context, batch]
    if model:
        sql += " AND model LIKE ?"
        args.append(f"%{model}%")
    groups: dict[tuple, list[sqlite3.Row]] = defaultdict(list)
    with connect() as conn:
        for row in conn.execute(sql, args):
            groups[(row["gpu"], row["stack"], row["model"], row["precision"])].append(row)

    def med(rows, key):
        values = [r[key] for r in rows if r[key] is not None]
        return round(median(values), 2) if values else None

    out = []
    for (gpu, stack, model_id, precision), rows in groups.items():
        payloads = [json.loads(r["payload"])["results"] for r in rows]
        peaks = [p["run_peak_vram_gb"] for p in payloads if p.get("run_peak_vram_gb") is not None]
        out.append(LeaderboardRow(
            gpu=gpu, stack=stack, model=model_id, precision=precision, runs=len(rows),
            decode_tok_s=med(rows, "decode_tok_s"), best_decode_tok_s=round(max(r["decode_tok_s"] for r in rows), 2),
            steady_vram_gb=med(rows, "steady_vram_gb"), run_peak_vram_gb=round(median(peaks), 2) if peaks else None,
            efficiency=med(rows, "efficiency"), verified=any(r["status"] == "verified" for r in rows)))
    return sorted(out, key=lambda row: row.decode_tok_s, reverse=True)


class HubStats(BaseModel):
    submissions: int
    verified: int
    community: int
    gpus: list[str]
    stacks: list[str]
    models: list[str]
    contexts: list[int]


@router.get("/hub/stats", response_model=HubStats)
def hub_stats():
    live = "status IN ('verified','community')"
    with connect() as conn:
        def distinct(column):
            return [r[0] for r in conn.execute(f"SELECT DISTINCT {column} FROM submissions WHERE {live} ORDER BY 1")]
        count = lambda s: conn.execute("SELECT COUNT(*) FROM submissions WHERE status=?", (s,)).fetchone()[0]
        return HubStats(submissions=count("verified") + count("community"), verified=count("verified"),
                        community=count("community"), gpus=distinct("gpu"), stacks=distinct("stack"),
                        models=distinct("model"), contexts=distinct("context"))


class StatusChange(BaseModel):
    status: Status


@router.post("/hub/submissions/{submission_id}/status", include_in_schema=False)
def set_status(submission_id: str, change: StatusChange, x_admin_token: Optional[str] = Header(None)):
    expected = os.getenv("AMD_LLM_LAB_ADMIN_TOKEN")
    if not expected:
        raise HTTPException(status_code=404, detail="Not found.")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=403, detail="Invalid admin token.")
    with connect() as conn:
        updated = conn.execute("UPDATE submissions SET status=? WHERE id=?", (change.status, submission_id)).rowcount
    if not updated:
        raise HTTPException(status_code=404, detail="No submission with that id.")
    return {"id": submission_id, "status": change.status}
