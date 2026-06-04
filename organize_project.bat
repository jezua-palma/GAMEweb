@echo off
echo ================================================
echo   SHADOW DEPTHS - Project Organizer
echo ================================================
echo.
echo Reorganizing JS files into modules...

mkdir js\core 2>nul
mkdir js\entities 2>nul
mkdir js\world 2>nul
mkdir js\systems 2>nul
mkdir js\ui 2>nul
mkdir assets\images 2>nul
mkdir assets\sounds 2>nul

move js\main.js js\core\ 2>nul
move js\game.js js\core\ 2>nul
move js\utils.js js\core\ 2>nul
move js\audio.js js\core\ 2>nul
move js\particles.js js\core\ 2>nul

move js\player.js js\entities\ 2>nul
move js\enemy.js js\entities\ 2>nul
move js\boss.js js\entities\ 2>nul
move js\characters.js js\entities\ 2>nul

move js\dungeon.js js\world\ 2>nul
move js\items.js js\world\ 2>nul

move js\combat.js js\systems\ 2>nul

move js\auth.js js\ui\ 2>nul
move js\leaderboard.js js\ui\ 2>nul
move js\hud.js js\ui\ 2>nul

echo.
echo ================================================
echo Done! Project files successfully organized.
echo You can safely close this window and delete this script.
echo ================================================
pause
