import os
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as SQLAlchemySession

from database import engine, Base, get_db
import models
import schemas

# Create all database tables on application startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Vision Training API",
    description="Backend service for logging vision training calibration profiles and adaptive staircase sessions.",
    version="1.0.0"
)

# Enable CORS for frontend web application development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}

# ================================
# Calibration Endpoints
# ================================

@app.post("/calibration", response_model=schemas.CalibrationProfileResponse, status_code=status.HTTP_201_CREATED, tags=["Calibration"])
def create_calibration_profile(
    profile: schemas.CalibrationProfileCreate,
    db: SQLAlchemySession = Depends(get_db)
):
    db_profile = models.CalibrationProfile(
        profile_name=profile.profile_name,
        pixels_per_mm=profile.pixels_per_mm,
        viewing_distance_cm=profile.viewing_distance_cm,
        pixels_per_degree=profile.pixels_per_degree,
        screen_resolution_w=profile.screen_resolution_w,
        screen_resolution_h=profile.screen_resolution_h,
        created_at=profile.created_at
    )
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile

@app.get("/calibration", response_model=List[schemas.CalibrationProfileResponse], tags=["Calibration"])
def get_calibration_profiles(db: SQLAlchemySession = Depends(get_db)):
    return db.query(models.CalibrationProfile).order_by(models.CalibrationProfile.created_at.desc()).all()

@app.put("/calibration/{profile_id}", response_model=schemas.CalibrationProfileResponse, tags=["Calibration"])
def update_calibration_profile(
    profile_id: int,
    profile_update: schemas.CalibrationProfileUpdate,
    db: SQLAlchemySession = Depends(get_db)
):
    profile_obj = db.query(models.CalibrationProfile).filter(models.CalibrationProfile.id == profile_id).first()
    if not profile_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Calibration profile with ID {profile_id} not found")
    
    if profile_update.profile_name:
        profile_obj.profile_name = profile_update.profile_name
    
    db.commit()
    db.refresh(profile_obj)
    return profile_obj

@app.delete("/calibration/{profile_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Calibration"])
def delete_calibration_profile(profile_id: int, db: SQLAlchemySession = Depends(get_db)):
    profile_obj = db.query(models.CalibrationProfile).filter(models.CalibrationProfile.id == profile_id).first()
    if not profile_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Calibration profile with ID {profile_id} not found")
    
    db.query(models.Session).filter(models.Session.calibration_profile_id == profile_id).update({"calibration_profile_id": None})
    db.delete(profile_obj)
    db.commit()
    return None

# ================================
# Session Logging Endpoints
# ================================

@app.post("/sessions", response_model=schemas.SessionResponse, status_code=status.HTTP_201_CREATED, tags=["Sessions"])
def create_session(
    session_data: schemas.SessionCreate,
    db: SQLAlchemySession = Depends(get_db)
):
    mode = session_data.sessionMode or "standard"
    
    existing = db.query(models.Session).filter(
        models.Session.total_trials == session_data.totalTrials,
        models.Session.total_correct == session_data.totalCorrect,
        models.Session.session_mode == mode
    ).first()

    if existing and len(existing.orientation_results) > 0:
        return existing
    
    if existing:
        db.query(models.OrientationResult).filter(models.OrientationResult.session_id == existing.id).delete()
        db.delete(existing)
        db.commit()

    db_session = models.Session(
        calibration_profile_id=session_data.calibration_profile_id,
        started_at=session_data.sessionStartTime,
        ended_at=session_data.sessionEndTime,
        total_trials=session_data.totalTrials,
        total_correct=session_data.totalCorrect,
        session_mode=mode
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)

    for orient in session_data.orientationResults:
        db_orient = models.OrientationResult(
            session_id=db_session.id,
            theta_degrees=orient.orientationDegrees,
            threshold_contrast=orient.thresholdEstimate,
            trials_run=orient.totalTrials,
            reversal_count=orient.reversalCount
        )
        db.add(db_orient)

    db.commit()
    db.refresh(db_session)
    return db_session

@app.get("/sessions", response_model=List[schemas.SessionResponse], tags=["Sessions"])
def get_sessions(db: SQLAlchemySession = Depends(get_db)):
    return db.query(models.Session).order_by(models.Session.started_at.asc()).all()

@app.get("/sessions/{session_id}", response_model=schemas.SessionResponse, tags=["Sessions"])
def get_session(session_id: int, db: SQLAlchemySession = Depends(get_db)):
    session_obj = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session with ID {session_id} not found")
    return session_obj

@app.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Sessions"])
def delete_session(session_id: int, db: SQLAlchemySession = Depends(get_db)):
    session_obj = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session with ID {session_id} not found")
    
    db.query(models.OrientationResult).filter(models.OrientationResult.session_id == session_id).delete()
    db.delete(session_obj)
    db.commit()
    return None
