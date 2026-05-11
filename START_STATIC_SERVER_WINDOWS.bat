@echo off
setlocal
cd /d "%~dp0"
cls
echo ==========================================
echo  SETS Static Local Server - No npm needed
echo ==========================================
echo.
echo This uses PowerShell only. It serves static-preview at:
echo http://127.0.0.1:4179
echo.
echo Close this window to stop the preview server.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path '.\static-preview').Path; $listener=[System.Net.HttpListener]::new(); $url='http://127.0.0.1:4179/'; $listener.Prefixes.Add($url); try{$listener.Start()}catch{Write-Host 'Port busy. Opening existing preview...'; Start-Process $url; pause; exit}; Start-Process $url; Write-Host 'Serving SETS preview at' $url; while($listener.IsListening){$ctx=$listener.GetContext(); $path=$ctx.Request.Url.AbsolutePath.TrimStart('/'); if([string]::IsNullOrWhiteSpace($path)){$path='index.html'}; $file=Join-Path $root $path; if(-not (Test-Path $file -PathType Leaf)){ $ctx.Response.StatusCode=404; $bytes=[Text.Encoding]::UTF8.GetBytes('Not found'); } else { $ext=[IO.Path]::GetExtension($file).ToLower(); $types=@{'.html'='text/html';'.js'='text/javascript';'.css'='text/css';'.png'='image/png';'.svg'='image/svg+xml'}; $ctx.Response.ContentType=$types[$ext]; if(-not $ctx.Response.ContentType){$ctx.Response.ContentType='application/octet-stream'}; $bytes=[IO.File]::ReadAllBytes($file)}; $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length); $ctx.Response.Close()}"
pause
