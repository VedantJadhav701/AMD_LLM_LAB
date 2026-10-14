#!/usr/bin/env python3
"""
Train predictors for decode tok/s, prefill tok/s, peak VRAM, peak RAM and offload fraction.

Design:
  * Each target is modelled as a RESIDUAL on a physics baseline (roofline for speed, size+KV+overhead for memory).
  * Speed uses quantile models (10/50/90) so the app can show a range, not a fake-precise number.
  * Validation is LEAVE-ONE-HARDWARE-OUT (GroupKFold on hw_id): the only test that matters is "a laptop the model has
    never seen". Random row splits leak and will lie to you.
  * The model ships only if it beats the baseline on held-out hardware (see --require-win).
Usage: python train.py --data data/runs.jsonl --out model/ [--folds 5]
"""
import argparse, json
from pathlib import Path
import joblib, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor as HGB
from sklearn.model_selection import GroupKFold
from features import add_physics, design
from schema import validate

def gbm(alpha=None):
    kw = dict(max_depth=4, learning_rate=0.06, max_iter=400, min_samples_leaf=15, l2_regularization=1.0, early_stopping=True, validation_fraction=0.15, random_state=0)
    return HGB(loss="quantile", quantile=alpha, **kw) if alpha else HGB(**kw)

def speed_metrics(y, lo, mid, hi):
    ape = np.abs(mid - y) / y
    return {"MAPE": float(ape.mean()), "within_20pct": float((ape <= 0.2).mean()), "median_APE": float(np.median(ape)), "interval_80_coverage": float(((y >= lo) & (y <= hi)).mean()), "n": int(len(y))}

def cv_speed(d, target, folds):
    y = d[target].values; base = d["roofline_tok_s"].values; r = np.log(y / base)
    oof = np.full((len(d), 3), np.nan); const = np.full(len(d), np.nan)
    for tr, te in GroupKFold(n_splits=min(folds, d["hw_id"].nunique())).split(d, groups=d["hw_id"]):
        Xtr, cats = design(d.iloc[tr]); Xte, _ = design(d.iloc[te], cats); Xte = Xte.reindex(columns=Xtr.columns, fill_value=0)
        for i, a in enumerate((0.1, 0.5, 0.9)): oof[te, i] = np.exp(gbm(a).fit(Xtr, r[tr]).predict(Xte)) * base[te]
        const[te] = np.exp(np.median(r[tr])) * base[te]                       # baseline = roofline x one global efficiency
    oof.sort(axis=1)
    return speed_metrics(y, *oof.T), speed_metrics(y, const * 0.8, const, const * 1.25), oof

def fit_final(d, target, out):
    X, cats = design(d); r = np.log(d[target].values / d["roofline_tok_s"].values)
    models = {a: gbm(a).fit(X, r) for a in (0.1, 0.5, 0.9)}
    joblib.dump({"models": models, "cats": cats, "columns": list(X.columns), "target": target}, out / f"{target}.joblib")

def cv_memory(d, target, base_col, folds):
    dd = d[d[target].notna()]
    if dd["hw_id"].nunique() < 3 or len(dd) < 50: return None
    y = dd[target].values; b = dd[base_col].values; res = np.full(len(dd), np.nan)
    for tr, te in GroupKFold(n_splits=min(folds, dd["hw_id"].nunique())).split(dd, groups=dd["hw_id"]):
        Xtr, cats = design(dd.iloc[tr]); Xte, _ = design(dd.iloc[te], cats); Xte = Xte.reindex(columns=Xtr.columns, fill_value=0)
        res[te] = b[te] + gbm().fit(Xtr, y[tr] - b[tr]).predict(Xte)
    err = np.abs(res - y)
    return {"MAE": float(err.mean()), "baseline_MAE": float(np.abs(b - y).mean()), "n": int(len(y))}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", required=True); ap.add_argument("--out", default="model"); ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--require-win", action="store_true", help="exit non-zero unless the model beats the baseline on held-out hardware")
    a = ap.parse_args(); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    raw = pd.read_json(a.data, lines=True)
    if (raw["source"] == "synthetic").all(): print("WARNING: all rows are synthetic. Metrics below test the pipeline only and say NOTHING about real accuracy.")
    d = add_physics(validate(raw)).reset_index(drop=True)
    print(f"{len(d)} usable rows, {d['hw_id'].nunique()} distinct machines, {d['model_id'].nunique()} models")
    if d["hw_id"].nunique() < 8: print("WARNING: fewer than ~8 machines. Held-out-hardware results will be noisy; aim for 30+.")
    report = {"rows": len(d), "machines": int(d["hw_id"].nunique())}
    ml, base, _ = cv_speed(d, "decode_tok_s", a.folds); report["decode_tok_s"] = {"ml": ml, "baseline": base}
    p = d[d["prefill_tok_s"].notna()].copy()
    if len(p) > 50:
        p["roofline_tok_s"] = p["roofline_tok_s"] * 30   # prefill is compute-bound; the residual model absorbs the scale
        ml2, base2, _ = cv_speed(p, "prefill_tok_s", a.folds); report["prefill_tok_s"] = {"ml": ml2, "baseline": base2}
    report["peak_vram_gib"] = cv_memory(d, "peak_vram_gib", "need_gib", a.folds)
    report["peak_ram_gib"] = cv_memory(d, "peak_ram_gib", "need_gib", a.folds)
    d["_off"] = d["offload_frac_actual"]; d["_off_base"] = np.minimum(1.0, d["vram_fit_ratio"])
    report["offload_frac_actual"] = cv_memory(d.rename(columns={"offload_frac_actual": "offload_frac_actual"}), "offload_frac_actual", "_off_base", a.folds)
    json.dump(report, open(out / "report.json", "w"), indent=2); print(json.dumps(report, indent=2))
    win = ml["MAPE"] < base["MAPE"]
    if a.require_win and not win: raise SystemExit("Model does NOT beat the baseline on held-out hardware; do not ship it.")
    fit_final(d, "decode_tok_s", out)
    if len(p) > 50: fit_final(p, "prefill_tok_s", out)
    print("saved to", out)

if __name__ == "__main__":
    main()
