from datetime import datetime
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class IngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    camera_id: Name = "CAM-001"
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinates_together(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Supply latitude and longitude together, or omit both for a synthetic GMC point")
        return self


class DetectionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    species: Name
    confidence: float = Field(ge=0, le=1)
    discarded: bool = False


class ObservationRequest(IngestRequest):
    """Persist a result already produced by the existing external detector."""
    species: Name
    confidence: float = Field(ge=0, le=1)
    discarded: bool = False
    expected_gewog_code: int | None = Field(default=None, gt=0)


def require_aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        raise ValueError("Use an ISO timestamp with timezone, e.g. 2026-10-28T00:00:00+06:00")
    return value
