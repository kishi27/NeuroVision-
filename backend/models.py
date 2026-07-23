from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class CalibrationProfile(Base):
    __tablename__ = "calibration_profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    profile_name = Column(String, nullable=False)
    pixels_per_mm = Column(Float, nullable=False)
    viewing_distance_cm = Column(Float, nullable=False)
    pixels_per_degree = Column(Float, nullable=False)
    screen_resolution_w = Column(Integer, nullable=False)
    screen_resolution_h = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False)

    sessions = relationship("Session", back_populates="calibration_profile")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    calibration_profile_id = Column(Integer, ForeignKey("calibration_profiles.id"), nullable=True)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)
    total_trials = Column(Integer, nullable=False)
    total_correct = Column(Integer, nullable=False)
    session_mode = Column(String, default="standard", nullable=False)

    calibration_profile = relationship("CalibrationProfile", back_populates="sessions")
    orientation_results = relationship(
        "OrientationResult",
        back_populates="session",
        cascade="all, delete-orphan"
    )


class OrientationResult(Base):
    __tablename__ = "orientation_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    theta_degrees = Column(Float, nullable=False)
    threshold_contrast = Column(Float, nullable=True)
    trials_run = Column(Integer, nullable=False)
    reversal_count = Column(Integer, nullable=False)

    session = relationship("Session", back_populates="orientation_results")
