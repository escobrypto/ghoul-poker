@echo off
cd /d "%~dp0"
echo.
echo   GHOUL POKER - PUSHING UPDATE
echo.
git add .
set "msg=%~1"
if "%msg%"=="" set "msg=Update %date% %time%"
git commit -m "%msg%"
git push
echo.
echo   DONE - Vercel is rebuilding, live in ~1-2 min.
echo.
pause
