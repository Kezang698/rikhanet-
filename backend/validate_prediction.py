"""Compare exact training feature windows with a real reference CSV.

Export JSON from the training notebook as a list of:
  {"reference_id": "known-id", "rows": [4-24 encoder feature rows, trigger row]}
CSV must identify the same sample via reference_id and contain p_present.
This runs inference only; it never creates a reference export from itself.
Without a passing report the application remains explicitly in prototype mode.
"""
import argparse
import csv
import json
import math
from pathlib import Path
from . import config
from .tft_runtime import TFTRuntime, validation_fingerprint, sha256


def validate(input_path):
    config.VALIDATION_PATH.unlink(missing_ok=True)
    samples = json.loads(Path(input_path).read_text(encoding="utf-8"))
    if not isinstance(samples, list) or not samples:
        raise ValueError("Provide at least one known training input window")
    with config.PARITY_PATH.open(newline="", encoding="utf-8-sig") as stream:
        references = list(csv.DictReader(stream))
    if not references or not {"reference_id", "p_present"}.issubset(references[0]):
        raise ValueError("Reference CSV must have reference_id,p_present columns exported from training")
    expected = {row["reference_id"]: float(row["p_present"]) for row in references}
    if len(expected) != len(references) or any(not 0 <= p <= 1 for p in expected.values()):
        raise ValueError("Reference probabilities/IDs must be valid and unique")
    runtime = TFTRuntime()
    errors = []
    seen = set()
    for sample in samples:
        key = str(sample["reference_id"])
        if key not in expected or key in seen:
            raise ValueError("Every input window needs a unique matching reference_id")
        seen.add(key)
        _, probability = runtime.predict(sample["rows"])
        error = abs(probability - expected[key])
        if not math.isfinite(error) or error > 1e-5:
            raise ValueError(f"Parity failed for {key}: absolute difference {error}; predictions remain in prototype mode")
        errors.append(error)
    report = {"hashes": validation_fingerprint(), "input_sha256": sha256(input_path),
              "samples": len(errors), "max_absolute_error": max(errors)}
    config.VALIDATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.VALIDATION_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", required=True, help="Known input windows exported from the matching training notebook")
    args = parser.parse_args()
    print(json.dumps(validate(args.inputs), indent=2))
