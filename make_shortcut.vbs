Set WshShell = CreateObject("WScript.Shell")
Set shortcut = WshShell.CreateShortcut("C:\Users\zhegr\Desktop\NeuroVision Trainer.lnk")
shortcut.TargetPath = "c:\Users\zhegr\training\launch_neurovision.bat"
shortcut.WorkingDirectory = "c:\Users\zhegr\training"
shortcut.Description = "Launch NeuroVision Vision Trainer App"
shortcut.WindowStyle = 7
shortcut.Save()
