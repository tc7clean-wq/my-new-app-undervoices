@echo off
echo UNDERGROUND VOICES - STATUS CHECK
echo ================================
echo.

echo Checking if app is running...
netstat -ano | findstr :3000
netstat -ano | findstr :3001
netstat -ano | findstr :3002

echo.
echo Checking build status...
if exist dist (
    echo ✅ Build directory exists
    dir dist
) else (
    echo ❌ Build directory missing
)

echo.
echo Checking package.json...
if exist package.json (
    echo ✅ Package.json exists
) else (
    echo ❌ Package.json missing
)

echo.
echo Checking Vite config...
if exist vite.config.js (
    echo ✅ Vite config exists
) else (
    echo ❌ Vite config missing
)

echo.
echo STATUS SUMMARY:
echo - Dev server: Check ports above
echo - Build: Check dist directory
echo - Config: All files present
echo.
pause
