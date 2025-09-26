@echo off
echo ===============================================
echo     Reverse Engineering Web App Deployment
echo ===============================================
echo.

echo Select deployment platform:
echo 1. Vercel (Recommended for Node.js apps)
echo 2. Netlify (Static sites with serverless functions)
echo 3. GitHub Pages (Static only - no backend)
echo 4. Heroku (Full Node.js support)
echo 5. Local deployment test
echo.

set /p choice=Enter your choice (1-5):

if "%choice%"=="1" goto vercel
if "%choice%"=="2" goto netlify
if "%choice%"=="3" goto github
if "%choice%"=="4" goto heroku
if "%choice%"=="5" goto local
goto invalid

:vercel
echo.
echo Deploying to Vercel...
echo.
echo Installing Vercel CLI if not installed...
call npm install -g vercel
echo.
echo Starting deployment...
call vercel
goto end

:netlify
echo.
echo Deploying to Netlify...
echo.
echo Installing Netlify CLI if not installed...
call npm install -g netlify-cli
echo.
echo Building project...
call npm run build
echo.
echo Starting deployment...
call netlify deploy --prod
goto end

:github
echo.
echo Preparing for GitHub Pages...
echo.
echo Building static files...
call npm run build
echo.
echo GitHub Pages only supports static sites.
echo Please push your code to GitHub and enable Pages in repository settings.
echo Repository Settings > Pages > Source: Deploy from branch
echo Select branch: main (or gh-pages) and folder: /public
echo.
pause
goto end

:heroku
echo.
echo Deploying to Heroku...
echo.
echo Make sure you have:
echo 1. Heroku CLI installed
echo 2. A Heroku account
echo 3. Created a Heroku app
echo.
set /p appname=Enter your Heroku app name:
echo.
echo Creating Procfile...
echo web: node server.js > Procfile
echo.
echo Deploying to Heroku...
call git add .
call git commit -m "Deploy to Heroku"
call heroku git:remote -a %appname%
call git push heroku main
goto end

:local
echo.
echo Starting local deployment test...
echo.
echo Installing dependencies...
call npm install
echo.
echo Starting server...
call npm start
goto end

:invalid
echo Invalid choice. Please run the script again.
goto end

:end
echo.
echo ===============================================
echo     Deployment process completed!
echo ===============================================
pause