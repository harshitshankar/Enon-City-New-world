@echo off
REM ---------------------------------------------------------------------------
REM build-android.bat  (Windows equivalent of build-android.sh)
REM
REM Builds the web game and copies dist/index.html into the Android project's
REM assets folder so the WebView can load it from file:///android_asset/.
REM ---------------------------------------------------------------------------

echo =========================================
echo   NEON CITY — Android Build Script
echo =========================================

echo.
echo [1/3] Building web game (npm run build)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed.
    pause
    exit /b 1
)
echo       Done.

echo.
echo [2/3] Preparing Android assets...
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"

echo.
echo [3/3] Copying dist\index.html -^> assets\index.html...
copy /Y "dist\index.html" "android\app\src\main\assets\index.html" >nul
echo       Done.

echo.
echo =========================================
echo   Next steps:
echo.
echo   1. Open the android\ folder in Android Studio.
echo   2. Wait for Gradle sync.
echo   3. Connect a phone or use the emulator.
echo   4. Click Run.
echo.
echo   To load from a URL instead of the bundled file,
echo   edit MainActivity.java and change loadUrl()
echo   to your deployed URL.
echo =========================================
pause
