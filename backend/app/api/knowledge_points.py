from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from sqlalchemy import func
from sqlalchemy import delete as sql_delete

from app.core.database import get_db
from app.models.knowledge import KnowledgePoint
from app.models.question import Question
from app.schemas.knowledge_point import KnowledgePointCreate, KnowledgePointUpdate, KnowledgePointOut

router = APIRouter(prefix="/knowledge-points", tags=["知识点"])


def _update_path(node_id: int, db: Session):
    node = db.query(KnowledgePoint).filter(KnowledgePoint.id == node_id).first()
    if not node:
        return
    if node.parent_id:
        parent = db.query(KnowledgePoint).filter(KnowledgePoint.id == node.parent_id).first()
        parent_path = parent.path if parent else "/"
        node.path = f"{parent_path}{node.id}/"
    else:
        node.path = f"/{node.id}/"
    # 注意：这里不能直接 commit，否则会与外部事务冲突。由调用者统一提交。


def _count_questions_recursive(kp: KnowledgePoint, db: Session, question_types: Optional[List[str]] = None) -> int:
    descendant_ids = db.query(KnowledgePoint.id).filter(
        KnowledgePoint.path.like(f"{kp.path}%")
    ).all()
    all_ids = [id_[0] for id_ in descendant_ids]
    if not all_ids:
        return 0
    query = db.query(func.count(Question.id)).filter(
        Question.knowledge_point_id.in_(all_ids),
        Question.deleted_at == None,
    )
    if question_types:
        query = query.filter(Question.question_type.in_(question_types))
    count = query.scalar()
    return count or 0

def build_tree_with_counts(nodes: List[KnowledgePoint], db: Session, question_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    if not nodes:
        return []

    node_map = {node.id: node for node in nodes}
    for node in nodes:
        node._children_list = []

    roots = []
    for node in nodes:
        if node.parent_id is None or node.parent_id not in node_map:
            roots.append(node)
        else:
            parent = node_map.get(node.parent_id)
            if parent:
                parent._children_list.append(node)

    def serialize(node: KnowledgePoint) -> Dict[str, Any]:
        # 递归处理子节点（保留所有子节点，不再过滤）
        children = []
        for child in node._children_list:
            children.append(serialize(child))

        # 计算该节点的题目数量
        question_count = _count_questions_recursive(node, db, question_types)

        return {
            "id": node.id,
            "name": node.name,
            "stage": node.stage,
            "parent_id": node.parent_id,
            "level_type": node.level_type,
            "sort_order": node.sort_order,
            "description": node.description,
            "question_count": question_count,
            "children": children,
        }

    return [serialize(root) for root in roots]


@router.post("/", response_model=KnowledgePointOut)
def create_knowledge_point(
    kp: KnowledgePointCreate,
    db: Session = Depends(get_db),
):
    existing = db.query(KnowledgePoint).filter(
        KnowledgePoint.stage == kp.stage,
        KnowledgePoint.parent_id == kp.parent_id,
        KnowledgePoint.name == kp.name,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="同级知识点名称已存在")

    new_kp = KnowledgePoint(
        name=kp.name,
        stage=kp.stage,
        parent_id=kp.parent_id,
        level_type=kp.level_type or "point",
        sort_order=kp.sort_order or 0,
        description=kp.description,
        path="/",  # 临时
    )
    db.add(new_kp)
    db.flush()

    # 立即计算 path（此时 new_kp.id 已可用）
    if new_kp.parent_id:
        parent = db.query(KnowledgePoint).filter(KnowledgePoint.id == new_kp.parent_id).first()
        new_kp.path = f"{parent.path}{new_kp.id}/" if parent else f"/{new_kp.id}/"
    else:
        new_kp.path = f"/{new_kp.id}/"
    db.commit()
    db.refresh(new_kp)
    return new_kp


@router.get("/tree", response_model=List[dict])
def get_knowledge_tree(
    stage: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(KnowledgePoint)
    if stage:
        query = query.filter(KnowledgePoint.stage == stage)
    all_nodes = query.order_by(KnowledgePoint.sort_order).all()

    # 解析 question_type 为列表
    types_list = None
    if question_type:
        types_list = [t.strip() for t in question_type.split(',') if t.strip()]

    return build_tree_with_counts(all_nodes, db, types_list)

@router.get("/{kp_id}", response_model=dict)
def get_knowledge_point(
    kp_id: int,
    question_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    kp = db.query(KnowledgePoint).filter(KnowledgePoint.id == kp_id).first()
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")
    types_list = None
    if question_type:
        types_list = [t.strip() for t in question_type.split(',') if t.strip()]
    question_count = _count_questions_recursive(kp, db, types_list)
    return {
        "id": kp.id,
        "name": kp.name,
        "stage": kp.stage,
        "parent_id": kp.parent_id,
        "level_type": kp.level_type,
        "sort_order": kp.sort_order,
        "path": kp.path,
        "description": kp.description,
        "question_count": question_count,
    }


@router.put("/{kp_id}")
def update_knowledge_point(
    kp_id: int,
    data: KnowledgePointUpdate,
    db: Session = Depends(get_db),
):
    kp = db.query(KnowledgePoint).filter(KnowledgePoint.id == kp_id).first()
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")

    if data.name is not None:
        existing = db.query(KnowledgePoint).filter(
            KnowledgePoint.stage == kp.stage,
            KnowledgePoint.parent_id == kp.parent_id,
            KnowledgePoint.name == data.name,
            KnowledgePoint.id != kp_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="同级知识点名称已存在")
        kp.name = data.name

    if data.description is not None:
        kp.description = data.description
    if data.level_type is not None:
        kp.level_type = data.level_type
    if data.sort_order is not None:
        kp.sort_order = data.sort_order

    db.commit()
    db.refresh(kp)
    return {"status": "updated", "id": kp.id}


@router.put("/{kp_id}/rename")
def rename_knowledge_point(
    kp_id: int,
    new_name: str,
    db: Session = Depends(get_db),
):
    kp = db.query(KnowledgePoint).filter(KnowledgePoint.id == kp_id).first()
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")

    existing = db.query(KnowledgePoint).filter(
        KnowledgePoint.stage == kp.stage,
        KnowledgePoint.parent_id == kp.parent_id,
        KnowledgePoint.name == new_name,
        KnowledgePoint.id != kp_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="同级知识点名称已存在")

    kp.name = new_name
    db.commit()
    db.refresh(kp)
    return {"id": kp.id, "name": kp.name, "parent_id": kp.parent_id}


@router.put("/{kp_id}/move")
def move_knowledge_point(
    kp_id: int,
    new_parent_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    kp = db.query(KnowledgePoint).filter(KnowledgePoint.id == kp_id).first()
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")

    if new_parent_id is not None:
        new_parent = db.query(KnowledgePoint).filter(KnowledgePoint.id == new_parent_id).first()
        if not new_parent:
            raise HTTPException(status_code=404, detail="新父节点不存在")
        if new_parent.path.startswith(f"{kp.path}") or new_parent.id == kp_id:
            raise HTTPException(status_code=400, detail="不能将节点移动到自己的子孙下")

    kp.parent_id = new_parent_id
    db.flush()
    _update_path(kp_id, db)
    db.commit()
    db.refresh(kp)
    return {"id": kp.id, "name": kp.name, "parent_id": kp.parent_id}


@router.delete("/{kp_id}")
def delete_knowledge_point(kp_id: int, db: Session = Depends(get_db)):
    kp = db.query(KnowledgePoint).filter(KnowledgePoint.id == kp_id).first()
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")

    # 1. 将所有子节点提升到当前节点的父节点下
    db.query(KnowledgePoint).filter(
        KnowledgePoint.parent_id == kp_id
    ).update(
        {KnowledgePoint.parent_id: kp.parent_id},
        synchronize_session=False
    )
    db.flush()

    # 2. 更新被移动子节点的路径
    children = db.query(KnowledgePoint).filter(KnowledgePoint.parent_id == kp.parent_id).all()
    for child in children:
        _update_path(child.id, db)

    # 3. 使用原始 SQL 直接删除当前节点，避免 ORM 级联
    stmt = sql_delete(KnowledgePoint).where(KnowledgePoint.id == kp_id)
    db.execute(stmt)
    db.commit()

    return {"status": "deleted"}