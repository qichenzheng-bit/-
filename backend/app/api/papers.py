from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import os
import math

from pydantic import BaseModel

from app.core.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.paper import Paper, PaperQuestion
from app.models.question import Question
from app.schemas.paper import (
    PaperCreate, PaperUpdate, PaperOut,
    PaperQuestionOut, AddQuestionToPaper, UpdatePaperQuestion,
)
from app.services.latex_generator import generate_latex
from app.services.latex_compiler import compile_latex_to_pdf, latex_to_docx_via_pandoc

router = APIRouter(prefix="/papers", tags=["组卷"])


class BatchAddQuestions(BaseModel):
    question_ids: List[str]
    scores: Optional[List[int]] = None


def _recalculate_total(db: Session, paper_id: int):
    items = db.query(PaperQuestion).filter(PaperQuestion.paper_id == paper_id).all()
    total = 0
    for it in items:
        if it.score:
            total += it.score
        elif it.question_id and not it.is_text:
            q = db.query(Question).filter(Question.id == it.question_id).first()
            if q:
                total += max(q.difficulty * 2, 2)
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if paper:
        paper.total_score = total
        db.commit()


# ==================== CRUD ====================

@router.get("/", response_model=dict)  # 返回包含 total 和 items 的分页结构
def list_papers(
    paper_type: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    keyword: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(0, ge=0, le=100),  # 0 表示不分页，返回全部
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Paper).filter(Paper.user_id == current_user.id)
    if paper_type:
        query = query.filter(Paper.paper_type == paper_type)
    if stage:
        query = query.filter(Paper.stage == stage)

    # 由于年份在 meta_info JSON 中，无法在数据库层直接过滤，先查出所有匹配的试卷，再在应用层筛选
    papers = query.order_by(Paper.updated_at.desc()).all()

    # 应用层过滤：年份、关键词
    filtered = []
    for p in papers:
        meta = {}
        if p.meta_info:
            try:
                meta = json.loads(p.meta_info)
            except:
                pass
        # 年份筛选（如果 meta 中有 year 字段）
        if year is not None:
            meta_year = meta.get("year")
            if meta_year is None or int(meta_year) != year:
                continue
        # 关键词搜索：匹配 ID（转为字符串）或标题
        if keyword:
            kw = keyword.strip()
            if not (kw in str(p.id) or (p.title and kw in p.title)):
                continue
        filtered.append(p)

    total = len(filtered)

    # 分页
    if page_size > 0:
        start = (page - 1) * page_size
        end = start + page_size
        items = filtered[start:end]
    else:
        items = filtered

    # 将 Paper 模型序列化为字典（直接使用 Pydantic 的 from_attributes，但需手动处理 meta_info）
    result_items = []
    for p in items:
        meta = {}
        if p.meta_info:
            try:
                meta = json.loads(p.meta_info)
            except:
                pass
        result_items.append({
            "id": p.id,
            "user_id": p.user_id,
            "title": p.title,
            "paper_type": p.paper_type,
            "stage": p.stage,
            "answer_mode": p.answer_mode,
            "total_score": p.total_score,
            "meta_info": meta,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size if page_size > 0 else total,
        "items": result_items,
    }


@router.post("/", response_model=PaperOut)
def create_paper(
    data: PaperCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = Paper(
        user_id=current_user.id,
        title=data.title,
        paper_type=data.paper_type,
        stage=data.stage,
        answer_mode=data.answer_mode,
        total_score=0,
        meta_info=json.dumps(data.meta_info) if data.meta_info else None,
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    return paper


@router.get("/{paper_id}", response_model=PaperOut)
def get_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    return paper


@router.put("/{paper_id}", response_model=PaperOut)
def update_paper(
    paper_id: int,
    data: PaperUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    if data.title is not None:
        paper.title = data.title
    if data.answer_mode is not None:
        paper.answer_mode = data.answer_mode
    if data.meta_info is not None:
        existing_meta = json.loads(paper.meta_info) if paper.meta_info else {}
        if isinstance(data.meta_info, dict):
            existing_meta.update(data.meta_info)
        paper.meta_info = json.dumps(existing_meta)
    if data.total_score is not None:
        paper.total_score = data.total_score
    db.commit()
    db.refresh(paper)
    return paper


@router.delete("/{paper_id}")
def delete_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    db.delete(paper)
    db.commit()
    return {"status": "deleted"}


# ==================== 组卷题目管理 ====================

@router.get("/{paper_id}/questions")
def get_paper_questions(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    items = db.query(PaperQuestion).filter(PaperQuestion.paper_id == paper_id).order_by(PaperQuestion.sort_order).all()
    result = []
    for item in items:
        preview = ""
        if item.is_text and item.text_content:
            preview = item.text_content[:100]
        elif item.question_id:
            q = db.query(Question).filter(Question.id == item.question_id).first()
            if q:
                preview = (q.content_latex or "")[:100]
        result.append({
            "id": item.id,
            "paper_id": item.paper_id,
            "question_id": item.question_id,
            "score": item.score,
            "sort_order": item.sort_order,
            "text_content": item.text_content,
            "is_text": item.is_text,
            "is_knowledge_block": item.is_knowledge_block,
            "content_preview": preview,
        })
    return result


@router.post("/{paper_id}/questions")
def add_question_to_paper(
    paper_id: int,
    data: AddQuestionToPaper,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    if not data.is_text and data.question_id:
        q = db.query(Question).filter(Question.id == data.question_id).first()
        if not q:
            raise HTTPException(status_code=404, detail="题目不存在")
    new_item = PaperQuestion(
        paper_id=paper_id,
        question_id=data.question_id if not data.is_text else None,
        sort_order=data.sort_order,
        score=data.score,
        text_content=data.text_content,
        is_text=data.is_text,
        is_knowledge_block=data.is_knowledge_block,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    _recalculate_total(db, paper_id)
    return {"id": new_item.id, "status": "added"}


@router.put("/{paper_id}/questions/{item_id}")
def update_paper_question(
    paper_id: int,
    item_id: int,
    data: UpdatePaperQuestion,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(PaperQuestion).filter(
        PaperQuestion.id == item_id,
        PaperQuestion.paper_id == paper_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="组卷题目不存在")
    if data.score is not None:
        item.score = data.score
    if data.sort_order is not None:
        item.sort_order = data.sort_order
    db.commit()
    _recalculate_total(db, paper_id)
    return {"status": "updated"}


@router.delete("/{paper_id}/questions/{item_id}")
def remove_paper_question(
    paper_id: int,
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(PaperQuestion).filter(
        PaperQuestion.id == item_id,
        PaperQuestion.paper_id == paper_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="组卷题目不存在")
    db.delete(item)
    db.commit()
    _recalculate_total(db, paper_id)
    return {"status": "removed"}


# ==================== 批量添加 ====================

@router.post("/{paper_id}/questions/batch")
def batch_add_questions(
    paper_id: int,
    data: BatchAddQuestions,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    current_count = db.query(PaperQuestion).filter(PaperQuestion.paper_id == paper_id).count()
    for idx, qid in enumerate(data.question_ids):
        q = db.query(Question).filter(Question.id == qid).first()
        if not q:
            continue
        score = data.scores[idx] if data.scores and idx < len(data.scores) else max(q.difficulty * 2, 2)
        item = PaperQuestion(
            paper_id=paper_id,
            question_id=qid,
            sort_order=current_count + idx + 1,
            score=score,
        )
        db.add(item)
    db.commit()
    _recalculate_total(db, paper_id)
    return {"status": "added", "count": len(data.question_ids)}


# ==================== 导出 ====================

@router.get("/{paper_id}/export/tex")
def export_tex(
    paper_id: int,
    mode: str = Query("teacher", regex="^(student|teacher|answer_only)$"),
    template: str = Query("exam"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    try:
        latex_content = generate_latex(paper_id, db, mode=mode, template=template)
        return Response(
            content=latex_content.encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=paper_{paper_id}.tex"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成 LaTeX 失败: {str(e)}")


@router.get("/{paper_id}/export/pdf")
def export_pdf(
    paper_id: int,
    mode: str = Query("teacher", regex="^(student|teacher|answer_only)$"),
    template: str = Query("exam"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    try:
        latex_content = generate_latex(paper_id, db, mode=mode, template=template)
        pdf_path = compile_latex_to_pdf(latex_content, f"paper_{paper_id}")
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"paper_{paper_id}.pdf",
            headers={"Content-Disposition": f"attachment; filename=paper_{paper_id}.pdf"},
        )
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=traceback.format_exc())


@router.get("/{paper_id}/export/word")
def export_word(
    paper_id: int,
    mode: str = Query("teacher", regex="^(student|teacher|answer_only)$"),
    template: str = Query("exam"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id, Paper.user_id == current_user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="组卷不存在")
    try:
        latex_content = generate_latex(paper_id, db, mode=mode, template=template)
        docx_path = latex_to_docx_via_pandoc(latex_content, f"paper_{paper_id}")
        return FileResponse(
            docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"paper_{paper_id}.docx",
            headers={"Content-Disposition": f"attachment; filename=paper_{paper_id}.docx"},
        )
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=traceback.format_exc())