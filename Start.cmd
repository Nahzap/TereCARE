@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

rem Arranque de TereCARE. Doble clic o: Start.cmd

where node >nul 2>&1
if errorlevel 1 (
  echo Falta Node.js. Instálalo y vuelve a abrir este archivo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo Falta npm. Vuelve a instalar Node.js.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

if not exist ".env.local" (
  if exist ".env.example" copy /y ".env.example" ".env.local" >nul
  echo Falta completar la configuración local antes de entrar.
)

powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 3000); $c.Close(); exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo TereCARE ya está en marcha: http://localhost:3000
  start "" "http://localhost:3000"
  exit /b 0
)

echo Abriendo http://localhost:3000 cuando el servidor responda...
start "" /min powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 3000); $c.Close(); Start-Process 'http://localhost:3000'; exit 0 } catch { Start-Sleep -Seconds 1 } }"

echo TereCARE
call npm run dev
