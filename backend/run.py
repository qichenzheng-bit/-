import sys
import os
import uvicorn
import webbrowser
import threading

# 强制设置密钥（确保运行时一致）
os.environ["SECRET_KEY"] = "finalsecret"

# 将 backend 目录加入 sys.path
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