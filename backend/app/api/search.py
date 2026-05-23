from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.core.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.question import Question
from app.models.paper import Paper

router = APIRouter(prefix="/search", tags=["全局搜索"])

@router.get("/")
def global_search(
    q: str = Query(..., min_length=1),
    scope: str = Query("all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = {"questions": [], "papers": [], "total_questions": 0, "total_papers": 0}
    if scope in ("questions", "all"):
        query = db.query(Question).filter(
            Question.user_id == current_user.id,
            Question.deleted_at == None,
            or_(
                Question.id.contains(q),
                Question.content_latex.contains(q),
                Question.knowledge_point.contains(q),
                Question.source.contains(q),
            ),
        )
        total_q = query.count()
        questions = query.offset((page-1)*page_size).limit(page_size).all()
        result["questions"] = [
            {"id": qq.id, "question_type": qq.question_type, "content_preview": (qq.content_latex or "")[:80], "stage": qq.stage}
            for qq in questions
        ]
        result["total_questions"] = total_q
    if scope in ("papers", "all"):
        query_p = db.query(Paper).filter(Paper.user_id == current_user.id, Paper.title.contains(q))
        total_p = query_p.count()
        papers = query_p.offset((page-1)*page_size).limit(page_size).all()
        result["papers"] = [{"id": p.id, "title": p.title, "paper_type": p.paper_type, "stage": p.stage} for p in papers]
        result["total_papers"] = total_p
    return result