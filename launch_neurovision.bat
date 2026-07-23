@echo off
title NeuroVision Vision Trainer
echo Starting NeuroVision Servers...

start /min "NeuroVision Backend" cmd /k "cd /d c:\Users\zhegr\training\backend && uvicorn main:app --port 8000"
start /min "NeuroVision Frontend" cmd /k "cd /d c:\Users\zhegr\training\frontend && python -m http.server 8080"

timeout /t 2 /nobreak >nul
start http://localhost:8080
exit
