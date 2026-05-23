from fastapi import APIRouter, UploadFile, File, HTTPException
import os, uuid, shutil
from datetime import datetime

router = APIRouter(prefix="/upload", tags=["上传"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp'}


@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}")

    unique_name = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    url = f"/static/uploads/{unique_name}"
    return {"url": url, "filename": unique_name}