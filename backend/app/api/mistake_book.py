from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone

from app.core.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.mistake_book import MistakeBook
from app.models.question import Question
from pydantic import BaseModel

router = APIRouter(prefix="/mistake-book", tags=["错题本"])


class MistakeAdd(BaseModel):
    question_id: str
    error_reason: Optional[str] = None


class MistakeOut(BaseModel):
    id: int
    question_id: str
    error_reason: Optional[str] = None
    review_count: int
    last_reviewed: Optional[str] = None
    status: str
    question_preview: Optional[str] = None
    knowledge_point: Optional[str] = None


@router.get("/", response_model=dict)
def list_mistakes(
    status: Optional[str] = Query(None, description="active / mastered"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(MistakeBook).filter(MistakeBook.user_id == current_user.id)
    if status:
        query = query.filter(MistakeBook.status == status)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for item in items:
        q = db.query(Question).filter(Question.id == item.question_id).first()
        preview = (q.content_latex or "")[:80] if q else ""
        kp = q.knowledge_point if q else ""
        result.append({
            "id": item.id,
            "question_id": item.question_id,
            "error_reason": item.error_reason,
            "review_count": item.review_count,
            "last_reviewed": item.last_reviewed.isoformat() if item.last_reviewed else None,
            "status": item.status,
            "question_preview": preview,
            "knowledge_point": kp,
        })
    return {"total": total, "page": page, "page_size": page_size, "items": result}


@router.post("/", response_model=dict)
def add_mistake(
    req: MistakeAdd,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 检查题目是否存在
    q = db.query(Question).filter(Question.id == req.question_id, Question.user_id == current_user.id).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")

    # 防止重复添加
    existing = db.query(MistakeBook).filter(
        MistakeBook.user_id == current_user.id,
        MistakeBook.question_id == req.question_id,
        MistakeBook.status == 'active',
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="该题已在错题本中")

    mb = MistakeBook(
        user_id=current_user.id,
        question_id=req.question_id,
        error_reason=req.error_reason,
        review_count=0,
    )
    db.add(mb)
    db.commit()
    db.refresh(mb)
    return {"id": mb.id, "status": "added"}


@router.put("/{mistake_id}/review")
def review_mistake(
    mistake_id: int,
    mastered: bool = Query(False),
    error_reason: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mb = db.query(MistakeBook).filter(
        MistakeBook.id == mistake_id,
        MistakeBook.user_id == current_user.id,
    ).first()
    if not mb:
        raise HTTPException(status_code=404, detail="记录不存在")

    mb.review_count += 1
    mb.last_reviewed = datetime.now(timezone.utc)
    if mastered:
        mb.status = 'mastered'
    if error_reason:
        mb.error_reason = error_reason
    db.commit()
    return {"status": "reviewed"}


@router.delete("/{mistake_id}")
def delete_mistake(
    mistake_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mb = db.query(MistakeBook).filter(
        MistakeBook.id == mistake_id,
        MistakeBook.user_id == current_user.id,
    ).first()
    if not mb:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.delete(mb)
    db.commit()
    return {"status": "deleted"}