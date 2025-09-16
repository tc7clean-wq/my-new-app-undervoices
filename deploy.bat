@echo off
echo Deploying Underground Voices to Vercel...
echo.
echo Building project...
npm run build
echo.
echo Deploying to Vercel...
npx vercel --prod --yes
echo.
echo Deployment complete!
pause
