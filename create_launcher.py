import os
import subprocess

base_dir = r"c:\Users\zhegr\training"
bat_path = os.path.join(base_dir, "launch_neurovision.bat")

bat_lines = [
    "@echo off",
    "title NeuroVision Vision Trainer",
    "echo Starting NeuroVision Servers...",
    "",
    'start /min "NeuroVision Backend" cmd /k "cd /d c:\\Users\\zhegr\\training\\backend && uvicorn main:app --port 8000"',
    'start /min "NeuroVision Frontend" cmd /k "cd /d c:\\Users\\zhegr\\training\\frontend && python -m http.server 8080"',
    "",
    "timeout /t 2 /nobreak >nul",
    "start http://localhost:8080",
    "exit"
]

with open(bat_path, "w", encoding="utf-8") as f:
    f.write("\n".join(bat_lines) + "\n")

print("Created BAT file:", bat_path)

desktop_folder = os.path.join(os.environ["USERPROFILE"], "Desktop")
shortcut_path = os.path.join(desktop_folder, "NeuroVision Trainer.lnk")

vbs_lines = [
    'Set WshShell = CreateObject("WScript.Shell")',
    f'Set shortcut = WshShell.CreateShortcut("{shortcut_path}")',
    f'shortcut.TargetPath = "{bat_path}"',
    f'shortcut.WorkingDirectory = "{base_dir}"',
    'shortcut.Description = "Launch NeuroVision Vision Trainer App"',
    'shortcut.WindowStyle = 7',
    'shortcut.Save()'
]

vbs_path = os.path.join(base_dir, "make_shortcut.vbs")
with open(vbs_path, "w", encoding="utf-8") as f:
    f.write("\n".join(vbs_lines) + "\n")

subprocess.run(["cscript", "//Nologo", vbs_path], check=True)
print("SUCCESS: Desktop Shortcut created at:", shortcut_path)
