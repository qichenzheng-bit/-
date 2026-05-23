import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import set_key, load_dotenv
from openai import OpenAI
import re

router = APIRouter(prefix="/config", tags=["配置"])

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", "..", ".env")

class APIKeyRequest(BaseModel):
    api_key: str

def _get_static_dir():
    return os.path.join(os.path.dirname(__file__), "..", "..", "static")

@router.get("/check")
def check_api_key():
    """检查当前是否已配置有效的 API Key"""
    load_dotenv()
    key = os.getenv("DOUBAO_API_KEY")
    if not key:
        return {"status": "missing", "message": "未配置 API Key"}
    if not key.startswith("ark-"):
        return {"status": "invalid", "message": "API Key 格式不正确"}
    try:
        base_url = os.getenv("DOUBAO_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
        client = OpenAI(api_key=key, base_url=base_url)
        client.models.list()
        return {"status": "valid", "message": "API Key 有效"}
    except Exception as e:
        return {"status": "invalid", "message": f"API Key 验证失败: {str(e)}"}

@router.post("/key")
def save_api_key(req: APIKeyRequest):
    """保存并验证 API Key"""
    new_key = req.api_key.strip()
    if not new_key.startswith("ark-"):
        raise HTTPException(status_code=400, detail="API Key 格式不正确，必须以 'ark-' 开头")

    # 验证 Key 有效性
    base_url = os.getenv("DOUBAO_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
    try:
        client = OpenAI(api_key=new_key, base_url=base_url)
        client.models.list()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"API Key 无效: {str(e)}")

    # 写入 .env 文件
    if os.path.exists(ENV_FILE):
        set_key(ENV_FILE, "DOUBAO_API_KEY", new_key)
    else:
        with open(ENV_FILE, "w", encoding="utf-8") as f:
            f.write(f"DOUBAO_API_KEY={new_key}\n")
        # 确保其他配置项也存在
        with open(ENV_FILE, "a", encoding="utf-8") as f:
            f.write(f"DOUBAO_BASE_URL={base_url}\n")

    # 更新当前进程环境变量
    os.environ["DOUBAO_API_KEY"] = new_key
    return {"status": "success", "message": "API Key 配置成功"}