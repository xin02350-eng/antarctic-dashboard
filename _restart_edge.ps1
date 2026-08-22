$targets = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*codex_edge_profile_v5053*' }
foreach ($t in $targets) { Stop-Process -Id $t.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList @(
  '--headless=new',
  '--remote-debugging-port=9222',
  '--user-data-dir=C:\Users\sxxsh\AppData\Local\Temp\codex_edge_profile_v5053',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
) -WindowStyle Hidden
Start-Sleep -Seconds 4
try { (Invoke-RestMethod 'http://127.0.0.1:9222/json/version').Browser } catch { 'EDGE_NOT_READY' }
