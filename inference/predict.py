"""Shared model loading and prediction helpers for local YOLO inference."""

import sys
from contextlib import redirect_stdout
from io import BytesIO
from pathlib import Path


def load_model():
    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise RuntimeError(
            "Local YOLO dependencies are missing. Install them with: "
            "python -m pip install -r inference/requirements.txt"
        ) from error
    try:
        with redirect_stdout(sys.stderr):
            model = YOLO(str(model_path))
        return model
    except Exception as error:
        raise RuntimeError("The local model final.pt could not be loaded.") from error


model_path = Path(__file__).resolve().parents[1] / "final.pt"


def predict_bytes(model, image_bytes: bytes) -> dict:
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as error:
        raise RuntimeError("Pillow is missing. Reinstall inference/requirements.txt.") from error

    if not image_bytes:
        raise ValueError("The uploaded image was empty.")
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise ValueError("The uploaded file is not a readable image.") from error

    try:
        with redirect_stdout(sys.stderr):
            result = model.track(source=image, imgsz=640, persist=True, verbose=False)[0]
        names = result.names
        predictions = []
        if result.boxes is not None:
            boxes = result.boxes
            xywh = boxes.xywh.cpu().tolist()
            classes = boxes.cls.cpu().tolist()
            confidences = boxes.conf.cpu().tolist()
            track_ids = boxes.id.int().cpu().tolist() if boxes.id is not None else [None] * len(xywh)
            for coords, class_id, confidence, track_id in zip(xywh, classes, confidences, track_ids):
                class_index = int(class_id)
                if isinstance(names, dict):
                    class_name = str(names.get(class_index, class_index))
                else:
                    class_name = str(names[class_index])
                predictions.append(
                    {
                        "x": float(coords[0]),
                        "y": float(coords[1]),
                        "width": float(coords[2]),
                        "height": float(coords[3]),
                        "class": class_name,
                        "confidence": float(confidence),
                        "trackId": int(track_id) if track_id is not None else None,
                    }
                )
        return {
            "predictions": predictions,
            "image": {"width": image.width, "height": image.height},
        }
    except Exception as error:
        raise RuntimeError("The local model could not process this image.") from error
