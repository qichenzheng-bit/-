import sys
import os
import uvicorn
import webbrowser
import threading

# 将 backend 目录加入 sys.path，使 Python 能找到 app 模块
backend_path = os.path.join(os.path.dirname(__file__), "backend")
sys.path.insert(0, backend_path)

def open_browser():
    webbrowser.open('http://127.0.0.1:9000/')

if __name__ == "__main__":
    threading.Timer(2, open_browser).start()
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=9000,
        log_level="info"
    )