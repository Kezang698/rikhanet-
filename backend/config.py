"""Paths are resolved from the project, independently of the shell's cwd."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PG_DSN = os.environ.get("PG_DSN", "postgresql://rikhanet:rikhanet@127.0.0.1:5432/rikhanet")
GEWOG_SEED_PATH = Path(os.environ.get("GEWOG_SEED_PATH", ROOT / "gewogs_info (1).xlsx"))
MODEL_PATH = Path(os.environ.get("MODEL_PATH", ROOT / "rikhanet_tft_binary.ckpt"))
TRAINING_DATASET_PATH = Path(os.environ.get("TRAINING_DATASET_PKL", ROOT / "models/training_dataset.pkl"))
PARITY_PATH = Path(os.environ.get("PREDICTION_PARITY_CSV", ROOT / "tft_test_predictions.csv" if (ROOT / "tft_test_predictions.csv").is_file() else ROOT / "data/tft_test_predictions.csv"))
VALIDATION_PATH = Path(os.environ.get("PREDICTION_VALIDATION_PATH", ROOT / "models/prediction_validation.json"))
TIMEZONE = "Asia/Thimphu"
UPLOAD_DIR = Path(os.environ.get("RIKHANET_UPLOAD_DIR", ROOT / "uploads/sightings"))
