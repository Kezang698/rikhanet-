"""Keep the YOLO model warm and handle newline-delimited frame requests."""

import base64
import json
import sys

from predict import load_model, predict_bytes

PROTOCOL_MARKER = "@@RIKHANET@@"
PROTOCOL_VERSION = 2


def emit(payload: dict) -> None:
    sys.stdout.write(PROTOCOL_MARKER + json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> None:
    try:
        model = load_model()
    except Exception as error:
        emit({"ready": False, "protocolVersion": PROTOCOL_VERSION, "error": str(error)})
        return

    emit({"ready": True, "protocolVersion": PROTOCOL_VERSION})
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            request_id = request.get("id")
            image = base64.b64decode(request["image"], validate=True)
            result = predict_bytes(model, image)
            emit({"id": request_id, **result})
        except Exception as error:
            emit({"id": request.get("id"), "error": str(error)})


if __name__ == "__main__":
    main()
