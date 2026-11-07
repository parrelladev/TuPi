
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

script = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "IniciarTuPi.ps1")

shell.Run "powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & script & """", 0, False
