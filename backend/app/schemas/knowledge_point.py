from pydantic import BaseModel, Field
from typing import Optional, List

class KnowledgePointCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    stage: str = Field(default='G', pattern="^(X|C|G|Z|K)$")  # 默认高中，必填
    parent_id: Optional[int] = None
    level_type: Optional[str] = 'point'
    sort_order: Optional[int] = 0
    description: Optional[str] = None

class KnowledgePointUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    level_type: Optional[str] = None
    sort_order: Optional[int] = None
    description: Optional[str] = None

class KnowledgePointOut(BaseModel):
    id: int
    name: str
    stage: str
    parent_id: Optional[int] = None
    level_type: str
    sort_order: int
    path: Optional[str] = None
    description: Optional[str] = None
    question_count: Optional[int] = 0

    class Config:
        from_attributes = True

class KnowledgeTreeOut(BaseModel):
    id: int
    name: str
    stage: str
    parent_id: Optional[int] = None
    level_type: str
    sort_order: int
    description: Optional[str] = None
    question_count: Optional[int] = 0
    children: Optional[List['KnowledgeTreeOut']] = []

    class Config:
        from_attributes = True