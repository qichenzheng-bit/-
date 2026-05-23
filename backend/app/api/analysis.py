from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.services.analysis_service import (
    analyze_single_paper, compare_papers, get_dashboard_stats,
    find_similar_questions, trace_question_in_papers,
    detect_duplicate_questions_across_papers,
)

router = APIRouter(prefix="/analysis", tags=["智能分析"])

@router.get("/single/{paper_id}")
def single_analysis(paper_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return analyze_single_paper(paper_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/compare")
def compare_analysis(paper_ids: list[int], current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return compare_papers(paper_ids, db)

@router.get("/dashboard")
def dashboard(stage: Optional[str] = Query(None), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_dashboard_stats(stage=stage, db=db, user_id=current_user.id)

@router.get("/similar/{paper_id}")
def similar_analysis(paper_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return find_similar_questions(paper_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/trace/{question_id}")
def trace_question(question_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    results = trace_question_in_papers(question_id, db)
    return {"question_id": question_id, "appearances": results}

@router.post("/duplicates")
def check_duplicates_across_papers(paper_ids: list[int], current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return detect_duplicate_questions_across_papers(paper_ids, db)