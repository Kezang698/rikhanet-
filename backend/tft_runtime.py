"""CPU inference with the original fitted dataset encoders; no training or refit."""
import hashlib
import csv
import importlib.util
import importlib.metadata
import json
import pickle
import threading
from pathlib import Path
from . import config

_runtime = None
_runtime_lock = threading.Lock()


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validation_fingerprint():
    paths = {"checkpoint": config.MODEL_PATH,
             "parity_csv": config.PARITY_PATH, "features": Path(__file__).with_name("features.py"),
             "runtime": Path(__file__)}
    if config.TRAINING_DATASET_PATH.is_file():
        paths["training_dataset"] = config.TRAINING_DATASET_PATH
    fingerprint = {name: sha256(path) for name, path in paths.items()}
    for package in ("torch", "pytorch-forecasting", "scikit-learn", "pandas", "numpy"):
        fingerprint[f"version:{package}"] = importlib.metadata.version(package)
    return fingerprint


def readiness():
    missing = [name for name, path in {"checkpoint": config.MODEL_PATH}.items() if not path.is_file()]
    dependencies = [module for module in ("torch", "pytorch_forecasting") if importlib.util.find_spec(module) is None]
    if missing:
        return {"status": "unavailable", "missing_artifacts": missing, "missing_dependencies": dependencies,
                "reason": "The trained TFT checkpoint is missing."}
    if dependencies:
        return {"status": "unavailable", "missing_artifacts": [], "missing_dependencies": dependencies,
                "reason": "Install backend/requirements-prediction.txt in the backend environment."}
    try:
        report = json.loads(config.VALIDATION_PATH.read_text(encoding="utf-8"))
        if report.get("hashes") == validation_fingerprint() and report.get("samples", 0) > 0 and report.get("max_absolute_error", 1) <= 1e-5:
            return {"status": "ready", "missing_artifacts": [], "missing_dependencies": [], "reason": "TFT reference parity passed for the installed artifacts and feature implementation."}
    except (OSError, ValueError, KeyError):
        pass
    reference_reason = "A matching binary reference export is required for prediction parity."
    if config.PARITY_PATH.is_file():
        with config.PARITY_PATH.open(encoding="utf-8-sig", newline="") as stream:
            columns = next(csv.reader(stream), [])
        if {"p_medium", "p_high"}.issubset(columns) and "p_present" not in columns:
            reference_reason = "The supplied CSV is a three-class export and cannot validate this binary checkpoint."
    return {"status": "prototype", "missing_artifacts": [], "missing_dependencies": [],
            "dataset_source": "training_dataset.pkl" if config.TRAINING_DATASET_PATH.is_file() else "fitted checkpoint dataset parameters",
            "reason": "Prototype TFT inference enabled with the saved fitted encoders. " + reference_reason}


def load_tft(checkpoint_path):
    import torch
    from pytorch_forecasting import TemporalFusionTransformer
    from pytorch_forecasting.metrics import CrossEntropy
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    hparams = dict(checkpoint["hyper_parameters"])
    hparams.pop("monitor", None)
    # Pickled TorchMetrics objects retain a CUDA device flag even with CPU tensor
    # mapping. Recreate the same loss/default metrics before loading weights.
    hparams["loss"] = CrossEntropy()
    hparams.pop("logging_metrics", None)
    if hparams.get("output_size") != 2:
        raise ValueError("Expected a two-class elephant occurrence checkpoint")
    model = TemporalFusionTransformer(**hparams)
    state = checkpoint["state_dict"]
    if state and all(key.startswith("model.") for key in state):
        state = {key.removeprefix("model."): value for key, value in state.items()}
    model.load_state_dict(state, strict=True)
    model._rikhanet_dataset_parameters = hparams.get("dataset_parameters")
    return model.cpu().eval()


class TFTRuntime:
    def __init__(self):
        from pytorch_forecasting import TimeSeriesDataSet
        self.model = load_tft(config.MODEL_PATH)
        self.training = None
        if config.TRAINING_DATASET_PATH.is_file():
            with config.TRAINING_DATASET_PATH.open("rb") as stream:
                self.training = pickle.load(stream)
            if not isinstance(self.training, TimeSeriesDataSet):
                raise ValueError("training_dataset.pkl must contain the original TimeSeriesDataSet")
        parameters = self.training.get_parameters() if self.training is not None else self.model._rikhanet_dataset_parameters
        if not parameters or not parameters.get("categorical_encoders") or not parameters.get("scalers"):
            raise ValueError("Checkpoint does not contain the fitted categorical encoders and numerical scalers")
        if parameters["max_encoder_length"] != 24 or parameters["max_prediction_length"] != 1:
            raise ValueError("Training dataset must use a 24-event encoder and one-event decoder")
        self.parameters = parameters
        self.min_encoder_length = parameters["min_encoder_length"]
        self.lock = threading.Lock()

    def predict(self, rows):
        import pandas as pd
        import torch
        from pytorch_forecasting import TimeSeriesDataSet
        encoder_length = len(rows) - 1
        if not self.min_encoder_length <= encoder_length <= 24:
            raise ValueError(f"This checkpoint requires {self.min_encoder_length}–24 actual history rows and one trigger row")
        data = pd.DataFrame(rows)
        if data["pair"].nunique() != 1 or list(data["time_idx"]) != list(range(len(rows))):
            raise ValueError("Input must be one ordered pair with sequential event indices")
        required = {name for category in ("static_reals", "static_categoricals", "time_varying_known_reals", "time_varying_unknown_reals",
                                          "time_varying_known_categoricals", "time_varying_unknown_categoricals")
                    for name in (self.parameters.get(category) or [])}
        required -= {"encoder_length", "relative_time_idx"}
        if required - set(data.columns):
            raise ValueError(f"Missing model inputs: {sorted(required - set(data.columns))}")
        forbidden = {"latitude", "longitude", "sight_lat", "sight_lon", "day_of_year", "doy_sin", "doy_cos"}
        if required & forbidden:
            raise ValueError("Training schema differs from the approved feature contract")
        target = self.parameters["target"]
        if not isinstance(target, str):
            raise ValueError("Expected one binary classification target")
        classes = getattr(self.parameters["target_normalizer"], "classes_", {})
        zero = "0" if "0" in classes else 0
        one = "1" if "1" in classes else 1
        if classes.get(zero) != 0 or classes.get(one) != 1:
            raise ValueError("Class encoder must map absence to zero and presence to one")
        data[target] = zero
        weight = self.parameters.get("weight")
        if weight:
            data[weight] = 1.0
        with self.lock, torch.inference_mode():
            # from_parameters reuses fitted encoders/scalers; it must never fit new ones.
            from copy import deepcopy
            preserved = pickle.dumps(self.parameters)
            dataset = TimeSeriesDataSet.from_parameters(deepcopy(self.parameters), data, predict=True,
                stop_randomization=True, min_prediction_idx=encoder_length)
            for key, scaler in self.parameters["scalers"].items():
                fitted = dataset.get_parameters()["scalers"].get(key)
                if pickle.dumps(scaler) != pickle.dumps(fitted):
                    raise ValueError(f"Fitted training scaler changed during inference: {key}")
            for key, encoder in self.parameters["categorical_encoders"].items():
                fitted = dataset.get_parameters()["categorical_encoders"].get(key)
                if pickle.dumps(encoder) != pickle.dumps(fitted):
                    raise ValueError(f"Fitted categorical encoder changed during inference: {key}")
            if pickle.dumps(self.parameters) != preserved:
                raise ValueError("Training parameters changed during inference")
            if len(dataset) != 1:
                raise ValueError("Expected exactly one prediction window")
            batch, _ = next(iter(dataset.to_dataloader(train=False, batch_size=1, num_workers=0)))
            if batch["encoder_lengths"].tolist() != [encoder_length]:
                raise ValueError("Dataset did not retain the actual history events")
            output = self.model(batch)
            logits = output["prediction"]
            if tuple(logits.shape) != (1, 1, 2):
                raise ValueError(f"Unexpected TFT output shape: {tuple(logits.shape)}")
            probabilities = torch.softmax(logits[0, 0].float(), dim=-1).cpu().tolist()
        if any(not 0 <= p <= 1 for p in probabilities) or abs(sum(probabilities) - 1) > 1e-5:
            raise ValueError("TFT returned invalid probabilities")
        return tuple(probabilities)


def get_runtime():
    global _runtime
    with _runtime_lock:
        if _runtime is None:
            _runtime = TFTRuntime()
    return _runtime
