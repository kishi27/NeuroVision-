from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, field_validator

def parse_iso_datetime(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # Support trailing 'Z' UTC suffix across Python versions
        clean_str = value.replace('Z', '+00:00')
        return datetime.fromisoformat(clean_str)
    raise ValueError("Invalid datetime format")


class CalibrationProfileCreate(BaseModel):
    profile_name: str
    pixels_per_mm: float
    viewing_distance_cm: float
    pixels_per_degree: float
    screen_resolution_w: int
    screen_resolution_h: int
    created_at: str | datetime

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, v):
        return parse_iso_datetime(v)


class CalibrationProfileUpdate(BaseModel):
    profile_name: str


class CalibrationProfileResponse(BaseModel):
    id: int
    profile_name: str
    pixels_per_mm: float
    viewing_distance_cm: float
    pixels_per_degree: float
    screen_resolution_w: int
    screen_resolution_h: int
    created_at: datetime

    class Config:
        from_attributes = True


class OrientationResultCreate(BaseModel):
    orientationDegrees: float
    thresholdEstimate: Optional[float] = None
    reversalCount: int
    totalTrials: int
    isComplete: Optional[bool] = None


class SessionCreate(BaseModel):
    sessionStartTime: str | datetime
    sessionEndTime: str | datetime
    totalTrials: int
    totalCorrect: int
    orientationResults: List[OrientationResultCreate]
    calibration_profile_id: Optional[int] = None
    sessionMode: Optional[str] = "standard"

    @field_validator("sessionStartTime", "sessionEndTime", mode="before")
    @classmethod
    def validate_datetimes(cls, v):
        return parse_iso_datetime(v)


class OrientationResultResponse(BaseModel):
    id: int
    session_id: int
    theta_degrees: float
    threshold_contrast: Optional[float] = None
    trials_run: int
    reversal_count: int

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: int
    calibration_profile_id: Optional[int] = None
    started_at: datetime
    ended_at: datetime
    total_trials: int
    total_correct: int
    session_mode: str = "standard"
    orientation_results: List[OrientationResultResponse]

    class Config:
        from_attributes = True
