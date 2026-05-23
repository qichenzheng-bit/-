# backend/app/api/questions.py

import json, re
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.id_generator import generate_question_id
from app.auth import get_current_user
from app.models.user import User
from app.models.question import Question
from app.models.knowledge import KnowledgePoint
from app.models.paper import PaperQuestion
from app.schemas.question import (
    QuestionCreate, QuestionUpdate, QuestionOut,
    QuestionBatchUpdate, QuestionBatchDelete,
)
from app.services.math_dedup import check_duplicate_math

router = APIRouter(prefix="/questions", tags=["题目管理"])


def _get_knowledge_path(knowledge_point_id: Optional[int], knowledge_point_text: Optional[str], db: Session) -> Optional[str]:
    visited_ids = set()
    if knowledge_point_id:
        kp = db.query(KnowledgePoint).filter(KnowledgePoint.id == knowledge_point_id).first()
        if kp:
            path = []
            current = kp
            while current and current.id not in visited_ids:
                visited_ids.add(current.id)
                path.append(current.name)
                current = db.query(KnowledgePoint).filter(KnowledgePoint.id == current.parent_id).first() if current.parent_id else None
            path.reverse()
            return " > ".join(path) if path else None
    if knowledge_point_text and knowledge_point_text.strip():
        name_clean = re.sub(r'\s*\([^)]*\)\s*$', '', knowledge_point_text).strip()
        kp = db.query(KnowledgePoint).filter(KnowledgePoint.name == name_clean).first()
        if kp:
            path = []
            current = kp
            visited_ids.clear()
            while current and current.id not in visited_ids:
                visited_ids.add(current.id)
                path.append(current.name)
                current = db.query(KnowledgePoint).filter(KnowledgePoint.id == current.parent_id).first() if current.parent_id else None
            path.reverse()
            return " > ".join(path) if path else None
        else:
            return knowledge_point_text
    return None


def _get_question_detail(q: Question, db: Session) -> dict:
    detail = {
        "id": q.id,
        "user_id": q.user_id,
        "stage": q.stage,
        "category": q.category,
        "question_type": q.question_type,
        "content_latex": q.content_latex,
        "options_latex": q.options_latex,
        "answer_latex": q.answer_latex,
        "analysis_latex": q.analysis_latex,
        "difficulty": q.difficulty,
        "year": q.year,
        "source": q.source,
        "tags": json.loads(q.tags) if q.tags else [],
        "status": q.status,
        "created_at": q.created_at.isoformat() if q.created_at else None,
        "knowledge_point_id": q.knowledge_point_id,
        "knowledge_point": q.knowledge_point,
        "knowledge_point_path": _get_knowledge_path(q.knowledge_point_id, q.knowledge_point, db),
        "parent_id": q.parent_id,
    }
    return detail


@router.post("/", response_model=QuestionOut, status_code=201)
def create_question(
    data: QuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 使用新的 id_generator，传入 db 和 user_id 以避免冲突
    new_id = generate_question_id(data.stage, db, current_user.id)

    # 知识点自动创建与关联
    kp_id = None
    if data.knowledge_point and data.knowledge_point.strip():
        kp_name = data.knowledge_point.strip()
        kp = db.query(KnowledgePoint).filter(
            KnowledgePoint.name == kp_name
        ).first()
        if kp:
            kp_id = kp.id
        else:
            new_kp = KnowledgePoint(
                name=kp_name,
                stage=data.stage,
                parent_id=None,
                level_type='point',
                path='/',
            )
            db.add(new_kp)
            db.flush()
            if new_kp.parent_id:
                parent = db.query(KnowledgePoint).filter(KnowledgePoint.id == new_kp.parent_id).first()
                new_kp.path = f"{parent.path}{new_kp.id}/" if parent else f"/{new_kp.id}/"
            else:
                new_kp.path = f"/{new_kp.id}/"
            db.commit()
            kp_id = new_kp.id
        if kp:
            data.knowledge_point = kp.name
        elif kp_id:
            data.knowledge_point = kp_name

    tags_json = json.dumps(data.tags) if data.tags else None
    db_q = Question(
        id=new_id,
        user_id=current_user.id,
        stage=data.stage,
        category=data.category,
        question_type=data.question_type,
        content_latex=data.content_latex,
        options_latex=data.options_latex,
        answer_latex=data.answer_latex,
        analysis_latex=data.analysis_latex,
        parent_id=data.parent_id,
        knowledge_point_id=kp_id,
        knowledge_point=data.knowledge_point,
        difficulty=data.difficulty,
        year=data.year,
        source=data.source,
        tags=tags_json,
    )
    db.add(db_q)
    db.commit()
    db.refresh(db_q)
    return db_q


# ========== 查重（必须在单题查询之前） ==========
@router.get("/check-duplicate")
def check_duplicate(
    content: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing_questions = db.query(Question).filter(
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    ).all()
    existing_contents = [q.content_latex for q in existing_questions]
    similar_results = check_duplicate_math(content, existing_contents)
    results = []
    for item in similar_results:
        idx = item['index']
        q = existing_questions[idx]
        results.append({
            "id": q.id,
            "content": q.content_latex[:150] + ("..." if len(q.content_latex) > 150 else ""),
            "knowledge": q.knowledge_point,
            "similarity": item['similarity']
        })
    return {"similar_count": len(results), "similar_questions": results}


# ========== 批量操作 ==========
@router.put("/batch", response_model=dict)
def batch_update_questions(
    req: QuestionBatchUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    update_dict = {}
    if req.knowledge_point_id is not None:
        update_dict[Question.knowledge_point_id] = req.knowledge_point_id
    if req.year is not None:
        update_dict[Question.year] = req.year
    if req.difficulty is not None:
        update_dict[Question.difficulty] = req.difficulty
    if req.status is not None:
        update_dict[Question.status] = req.status
    if req.tags is not None:
        update_dict[Question.tags] = json.dumps(req.tags)
    if req.source is not None:
        update_dict[Question.source] = req.source
    if not update_dict:
        raise HTTPException(status_code=400, detail="没有提供要修改的字段")
    result = db.query(Question).filter(
        Question.id.in_(req.question_ids),
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    ).update(update_dict, synchronize_session=False)
    db.commit()
    return {"updated": result}


@router.delete("/batch", response_model=dict)
def batch_delete_questions(
    req: QuestionBatchDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = db.query(Question).filter(
        Question.id.in_(req.question_ids),
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    ).update({Question.deleted_at: now}, synchronize_session=False)
    db.commit()
    return {"deleted": result}


# ========== 单题操作 ==========
@router.get("/{question_id}", response_model=dict)
def get_question_detail(
    question_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Question).filter(
        Question.id == question_id,
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    detail = _get_question_detail(q, db)

    if q.question_type == '综合大题' and q.answer_latex:
        try:
            subs = json.loads(q.answer_latex)
            detail['sub_questions'] = subs
            detail['answer_latex'] = None
        except:
            pass

    paper_links = []
    pqs = db.query(PaperQuestion).filter(
        PaperQuestion.question_id == question_id,
        PaperQuestion.is_text == 0,
    ).all()
    from app.models.paper import Paper
    for pq in pqs:
        paper = db.query(Paper).filter(Paper.id == pq.paper_id).first()
        if paper:
            paper_links.append({
                "paper_id": paper.id,
                "paper_title": paper.title,
                "sort_order": pq.sort_order,
            })
    detail["appears_in_papers"] = paper_links
    return detail


@router.put("/{question_id}")
def update_question(
    question_id: str,
    data: QuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Question).filter(
        Question.id == question_id,
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    update_dict = data.dict(exclude_unset=True)
    if "tags" in update_dict and update_dict["tags"] is not None:
        update_dict["tags"] = json.dumps(update_dict["tags"])
    for key, value in update_dict.items():
        setattr(q, key, value)
    db.commit()
    return {"status": "success"}


@router.delete("/{question_id}")
def delete_question(
    question_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Question).filter(
        Question.id == question_id,
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    q.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "deleted"}


# ========== 查询 ==========
@router.get("/", response_model=dict)
def filter_questions(
    stage: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
    knowledge_point_id: Optional[int] = Query(None),
    knowledge_point_path: Optional[str] = Query(None),
    knowledge_point: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    difficulty: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Question).filter(
        Question.user_id == current_user.id,
        Question.deleted_at == None,
    )
    if stage:
        query = query.filter(Question.stage == stage)
    if category:
        query = query.filter(Question.category == category)
    if question_type:
       types= [t.strip() for t in question_type.split(',') if t.strip()]
       if types:
        query = query.filter(Question.question_type.in_(types))

    if knowledge_point_path:
        descendant_ids = db.query(KnowledgePoint.id).filter(
            KnowledgePoint.path.like(f"{knowledge_point_path}%")
        ).all()
        ids = [id_[0] for id_ in descendant_ids]
        if ids:
            query = query.filter(Question.knowledge_point_id.in_(ids))
        else:
            query = query.filter(Question.knowledge_point_id == None)
    elif knowledge_point_id is not None:
        if knowledge_point_id == -1:
            query = query.filter(Question.knowledge_point_id == None)
        else:
            query = query.filter(Question.knowledge_point_id == knowledge_point_id)

    if knowledge_point:
        query = query.filter(Question.knowledge_point.contains(knowledge_point))
    if year:
        query = query.filter(Question.year == year)
    if difficulty:
        query = query.filter(Question.difficulty == difficulty)
    if status:
        query = query.filter(Question.status == status)
    if source:
        query = query.filter(Question.source.contains(source))
    if keyword:
        query = query.filter(
            or_(
                Question.id.contains(keyword),
                Question.content_latex.contains(keyword),
            )
        )
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        for tag in tag_list:
            query = query.filter(Question.tags.contains(tag))

    total = query.count()
    items = query.order_by(Question.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    serialized_items = []
    for q in items:
        serialized_items.append({
            "id": q.id,
            "stage": q.stage,
            "category": q.category,
            "question_type": q.question_type,
            "knowledge_point_id": q.knowledge_point_id,
            "knowledge_point": q.knowledge_point,
            "difficulty": q.difficulty,
            "year": q.year,
            "source": q.source,
            "tags": json.loads(q.tags) if q.tags else [],
            "status": q.status,
            "created_at": q.created_at.isoformat() if q.created_at else None,
            "content_preview": (q.content_latex or "")[:100],
        })
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": serialized_items,
    }