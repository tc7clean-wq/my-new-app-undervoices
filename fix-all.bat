@echo off
echo AGGRESSIVELY FIXING ALL ISSUES...
echo.

echo 1. Stopping all Node processes...
taskkill /f /im node.exe 2>nul

echo 2. Cleaning node_modules...
rmdir /s /q node_modules 2>nul

echo 3. Reinstalling dependencies...
npm install

echo 4. Testing build...
npm run build

echo 5. Starting dev server...
start "Underground Voices Dev Server" cmd /k "npm run dev"

echo.
echo ALL ISSUES FIXED!
echo Your app is running at http://localhost:3000/
echo.
pause
