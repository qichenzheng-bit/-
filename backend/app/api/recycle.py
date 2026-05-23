from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.question import Question

router = APIRouter(prefix="/recycle", tags=["回收站"])


@router.get("/")
def list_recycled(
    stage: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Question).filter(
        Question.user_id == current_user.id,
        Question.deleted_at != None,
    )
    if stage:
        query = query.filter(Question.stage == stage)
    if question_type:
        query = query.filter(Question.question_type == question_type)
    if keyword:
        query = query.filter(Question.id.contains(keyword))

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    serialized = [{
        "id": q.id,
        "stage": q.stage,
        "question_type": q.question_type,
        "deleted_at": q.deleted_at.isoformat() if q.deleted_at else None,
        "status": q.status,
    } for q in items]
    return {"total": total, "page": page, "page_size": page_size, "items": serialized}


@router.post("/restore")
def restore_questions(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 兼容两种格式
    if isinstance(payload, list):
        ids = payload
    elif isinstance(payload, dict) and "question_ids" in payload:
        ids = payload["question_ids"]
    else:
        raise HTTPException(status_code=400, detail="需要 question_ids 数组")

    result = db.query(Question).filter(
        Question.id.in_(ids),
        Question.user_id == current_user.id,
        Question.deleted_at != None,
    ).update({Question.deleted_at: None}, synchronize_session=False)
    db.commit()
    return {"restored": result}


@router.delete("/permanent")
def permanent_delete_questions(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if isinstance(payload, list):
        ids = payload
    elif isinstance(payload, dict) and "question_ids" in payload:
        ids = payload["question_ids"]
    else:
        raise HTTPException(status_code=400, detail="需要 question_ids 数组")

    result = db.query(Question).filter(
        Question.id.in_(ids),
        Question.user_id == current_user.id,
        Question.deleted_at != None,
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": result}