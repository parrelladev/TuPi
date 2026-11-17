@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias do helper...
  call npm install
)
node index.js
pause
