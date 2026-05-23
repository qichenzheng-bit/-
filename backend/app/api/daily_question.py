from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone
import random

from app.core.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.daily_question import DailyQuestion
from app.models.question import Question

router = APIRouter(prefix="/daily-question", tags=["每日一题"])


@router.get("/today")
def get_today_question(
    stage: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 先检查今天是否已分配题目
    today = datetime.now(timezone.utc).date()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    existing = db.query(DailyQuestion).filter(
        DailyQuestion.user_id == current_user.id,
        DailyQuestion.date_shown >= today_start,
    ).first()
    if existing:
        q = db.query(Question).filter(Question.id == existing.question_id).first()
        if q:
            return {
                "id": existing.id,
                "question_id": q.id,
                "content_latex": q.content_latex,
                "options_latex": q.options_latex,
                "question_type": q.question_type,
                "was_answered": existing.was_answered,
                "answer_correct": existing.answer_correct,
            }

    # 随机选一道题
    query = db.query(Question).filter(
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    )
    if stage:
        query = query.filter(Question.stage == stage)
    questions = query.all()
    if not questions:
        raise HTTPException(status_code=404, detail="题库为空，无法生成每日一题")

    q = random.choice(questions)
    dq = DailyQuestion(
        user_id=current_user.id,
        question_id=q.id,
        date_shown=datetime.now(timezone.utc),
    )
    db.add(dq)
    db.commit()
    db.refresh(dq)
    return {
        "id": dq.id,
        "question_id": q.id,
        "content_latex": q.content_latex,
        "options_latex": q.options_latex,
        "question_type": q.question_type,
        "was_answered": 0,
        "answer_correct": None,
    }


@router.put("/{daily_id}/answer")
def answer_daily(
    daily_id: int,
    correct: bool = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dq = db.query(DailyQuestion).filter(
        DailyQuestion.id == daily_id,
        DailyQuestion.user_id == current_user.id,
    ).first()
    if not dq:
        raise HTTPException(status_code=404, detail="记录不存在")
    dq.was_answered = 1
    dq.answer_correct = 1 if correct else 0
    db.commit()
    return {"status": "answered"}


@router.get("/history")
def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(DailyQuestion).filter(
        DailyQuestion.user_id == current_user.id,
    ).order_by(DailyQuestion.date_shown.desc())

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    result = []
    for dq in items:
        q = db.query(Question).filter(Question.id == dq.question_id).first()
        result.append({
            "id": dq.id,
            "question_id": dq.question_id,
            "date_shown": dq.date_shown.isoformat() if dq.date_shown else None,
            "was_answered": dq.was_answered,
            "answer_correct": dq.answer_correct,
            "question_preview": (q.content_latex or "")[:50] if q else "",
        })
    return {"total": total, "page": page, "page_size": page_size, "items": result}