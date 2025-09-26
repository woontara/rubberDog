@echo off
REM Reverse Engineering Tools Installation Script for Windows
REM Run as Administrator for best results

echo Installing Reverse Engineering Tools...
echo.

REM Check if running as admin
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running as Administrator - Good!
) else (
    echo Warning: Not running as Administrator. Some installations may fail.
    echo Consider running this script as Administrator.
    pause
)

echo.
echo === Installing Chocolatey (Package Manager) ===
REM Install Chocolatey if not already installed
where choco >nul 2>&1
if %errorLevel% == 0 (
    echo Chocolatey already installed
) else (
    echo Installing Chocolatey...
    powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
)

echo.
echo === Installing Core RE Tools ===

REM Install HxD (Hex Editor)
echo Installing HxD Hex Editor...
choco install hxd -y

REM Install 7-Zip (Archive tool)
echo Installing 7-Zip...
choco install 7zip -y

REM Install Process Monitor
echo Installing Process Monitor...
choco install procmon -y

REM Install Process Explorer
echo Installing Process Explorer...
choco install procexp -y

REM Install Wireshark
echo Installing Wireshark...
choco install wireshark -y

REM Install Notepad++
echo Installing Notepad++...
choco install notepadplusplus -y

REM Install Git
echo Installing Git...
choco install git -y

echo.
echo === Installing Advanced RE Tools ===

REM Install x64dbg
echo Installing x64dbg...
choco install x64dbg.portable -y

REM Install Detect It Easy
echo Installing Detect It Easy...
choco install die -y

REM Install PE-bear
echo Installing PE-bear...
choco install pe-bear -y

echo.
echo === Optional Tools (Comment out if not needed) ===

REM Install IDA Free (if available)
REM echo Installing IDA Free...
REM choco install ida-free -y

REM Install Ghidra (requires Java)
echo Installing OpenJDK (required for Ghidra)...
choco install openjdk -y
echo Installing Ghidra...
choco install ghidra -y

REM Install Radare2
echo Installing Radare2...
choco install radare2 -y

echo.
echo === Installation Complete ===
echo.
echo Installed tools:
echo - HxD (Hex Editor)
echo - 7-Zip (Archive tool)
echo - Process Monitor & Process Explorer
echo - Wireshark (Network analysis)
echo - Notepad++ (Text editor)
echo - Git (Version control)
echo - x64dbg (Debugger)
echo - Detect It Easy (File analysis)
echo - PE-bear (PE analyzer)
echo - Ghidra (NSA reverse engineering tool)
echo - Radare2 (Command-line RE framework)
echo.
echo You may need to restart your command prompt or system for PATH changes to take effect.
echo.
pause