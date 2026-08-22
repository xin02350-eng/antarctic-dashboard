Start-Process -FilePath 'C:\Users\sxxsh\AppData\Local\Programs\Python\Python310\python.exe' -ArgumentList '_serve.py' -WorkingDirectory 'C:\Users\sxxsh\Documents\GitHub\antarctic-dashboard' -WindowStyle Hidden
Start-Sleep -Seconds 2
try { (Invoke-WebRequest 'http://127.0.0.1:8765/data.json' -UseBasicParsing -TimeoutSec 5).StatusCode } catch { 'SERVER_NOT_READY' }
