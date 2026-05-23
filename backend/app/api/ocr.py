from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
import os, shutil, json, fitz
from app.services.ai_service import suggest_tags

from app.core.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.question import Question
from app.services.ai_service import (
    ocr_image_to_latex, suggest_tags, fix_latex, batch_suggest_tags,
    generate_answer_analysis, split_text_to_questions,
    normalize_latex
)
from pydantic import BaseModel

router = APIRouter(prefix="/ocr", tags=["OCR"])


class FixLatexRequest(BaseModel):
    latex: str

class BatchTagRequest(BaseModel):
    question_ids: List[str]

class GenerateAnswerRequest(BaseModel):
    content_latex: str

class SplitTextRequest(BaseModel):
    text: str


def _save_temp_file(file: UploadFile) -> str:
    temp_dir = os.path.join(os.path.dirname(__file__), "..", "..", "tmp")
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return file_path


# ---------- 图片识别 ----------
@router.post("/recognize")
async def recognize_image(
    file: UploadFile = File(...),
    mode: str = Query("ai", description="ai 或 direct"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_path = _save_temp_file(file)
    try:
        if mode == "direct":
            latex_code = direct_ocr_image(file_path)
        else:
            try:
                latex_code = ocr_image_to_latex(file_path, current_user.id, db)
            except Exception as e:
                # 豆包失败，回退到免费 OCR
                print(f"豆包 OCR 失败: {e}，回退到免费 OCR")
                latex_code = direct_ocr_image(file_path)
        tags = suggest_tags(latex_code, current_user.id, db)
    finally:
        os.remove(file_path)
    return {
        "latex": latex_code,
        "knowledge": tags.get("knowledge", "未知"),
        "difficulty": tags.get("difficulty", 3),
    }

# ---------- 免费 OCR ----------
def direct_ocr_image(image_path: str) -> str:
    try:
        from pix2text import Pix2Text
        p2t = Pix2Text()
        outs = p2t.recognize(image_path)
        latex = ""
        if isinstance(outs, str):
            latex = outs
        elif isinstance(outs, list):
            for out in outs:
                if isinstance(out, str):
                    latex += out
                elif isinstance(out, dict):
                    if out.get('type') in ('text', 'latex'):
                        latex += out.get('text', '')
        return normalize_latex(latex)
    except ImportError:
        raise HTTPException(status_code=500, detail="免费OCR引擎未安装，请运行 pip install pix2text")


# ---------- AI 修复 / 打标 ----------

@router.post("/fix-latex")
def fix_latex_endpoint(
    req: FixLatexRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fixed = fix_latex(req.latex, current_user.id, db)
    return {"latex": fixed}


@router.post("/batch-tag")
def batch_tag_endpoint(
    req: BatchTagRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    questions = db.query(Question).filter(
        Question.id.in_(req.question_ids),
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    ).all()
    if not questions:
        return {"updated": 0, "message": "没有找到有效的题目"}
    contents = [q.content_latex for q in questions]
    tags_list = batch_suggest_tags(contents, current_user.id, db)
    updated = 0
    for q, tags in zip(questions, tags_list):
        if "knowledge" in tags and tags["knowledge"] != "未知":
            q.knowledge_point = tags["knowledge"]
        if "difficulty" in tags:
            q.difficulty = tags["difficulty"]
        updated += 1
    db.commit()
    return {"updated": updated, "message": f"成功为 {updated} 道题目打标"}
@router.post("/suggest-tags")
def suggest_tags_endpoint(
    req: FixLatexRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tags = suggest_tags(req.latex, current_user.id, db)
    return tags


@router.post("/generate-answer")
def generate_answer(
    req: GenerateAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = generate_answer_analysis(req.content_latex, current_user.id, db)
    return result


@router.post("/split-text")
def split_text(
    req: SplitTextRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    questions = split_text_to_questions(req.text, current_user.id, db)
    return {"questions": questions}


# ========== PDF 相关 ==========
@router.post("/pdf-page-image")
async def get_pdf_page_image(
    file: UploadFile = File(...),
    page: int = Query(1, ge=1),
    dpi: int = Query(200, ge=72, le=600),
):
    temp_path = _save_temp_file(file)
    try:
        doc = fitz.open(temp_path)
        if page > len(doc):
            raise HTTPException(status_code=400, detail="页码超出范围")
        page_obj = doc[page - 1]
        pix = page_obj.get_pixmap(dpi=dpi)
        img_bytes = pix.tobytes("png")
        doc.close()
        return Response(content=img_bytes, media_type="image/png")
    finally:
        os.remove(temp_path)


@router.post("/recognize-pdf-page")
async def recognize_pdf_page(
    file: UploadFile = File(...),
    page: int = Query(1, ge=1),
    mode: str = Query("ai", description="ai 或 direct"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    temp_path = _save_temp_file(file)
    try:
        doc = fitz.open(temp_path)
        if page > len(doc):
            raise HTTPException(status_code=400, detail="页码超出范围")
        page_obj = doc[page - 1]
        text = page_obj.get_text()
        doc.close()

        if not text.strip():
            pix = page_obj.get_pixmap(dpi=200)
            img_path = temp_path.replace(".pdf", "_page.png")
            pix.save(img_path)
            try:
                if mode == "direct":
                    latex_code = direct_ocr_image(img_path)
                else:
                    latex_code = ocr_image_to_latex(img_path, current_user.id, db)
            finally:
                os.remove(img_path)
        else:
            if mode == "direct":
                latex_code = text
            else:
                latex_code = fix_latex(text, current_user.id, db)

        return {"latex": latex_code}
    finally:
        os.remove(temp_path)


# ========== Word 相关 ==========
@router.post("/recognize-word-batch")
async def recognize_word_batch(
    file: UploadFile = File(...),
    mode: str = Query("direct", description="direct 或 ai"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    temp_path = _save_temp_file(file)
    try:
        import docx
        doc = docx.Document(temp_path)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        questions = [{"latex": p} for p in paragraphs]
        return {"questions": questions}
    except ImportError:
        raise HTTPException(status_code=500, detail="python-docx 未安装，请运行 pip install python-docx")
    finally:
        os.remove(temp_path)