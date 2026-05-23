from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# 所有允许的题型（题目 + 知识单元）
ALLOWED_TYPES = (
    "选择|填空|判断|简答|综合大题|"
    "定义|定理|引理|推论|命题|公理|性质|注释|评注|结论|"
    "例题|练习|问题"
)

class QuestionBase(BaseModel):
    stage: str = Field(..., pattern="^(X|C|G|Z|K)$")
    category: str = Field(default="试卷")
    question_type: str = Field(..., pattern=f"^({ALLOWED_TYPES})$")
    content_latex: str
    options_latex: Optional[str] = None
    answer_latex: Optional[str] = None
    analysis_latex: Optional[str] = None
    parent_id: Optional[str] = None
    knowledge_point: Optional[str] = None
    knowledge_point_id: Optional[int] = None
    difficulty: int = Field(default=3, ge=1, le=5)
    year: Optional[int] = None
    source: Optional[str] = None
    tags: Optional[List[str]] = None

class QuestionCreate(QuestionBase):
    pass

class QuestionUpdate(BaseModel):
    stage: Optional[str] = Field(None, pattern="^(X|C|G|Z|K)$")
    category: Optional[str] = None
    question_type: Optional[str] = Field(None, pattern=f"^({ALLOWED_TYPES})$")
    content_latex: Optional[str] = None
    options_latex: Optional[str] = None
    answer_latex: Optional[str] = None
    analysis_latex: Optional[str] = None
    parent_id: Optional[str] = None
    knowledge_point: Optional[str] = None
    knowledge_point_id: Optional[int] = None
    difficulty: Optional[int] = Field(None, ge=1, le=5)
    year: Optional[int] = None
    source: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None

class QuestionOut(QuestionBase):
    id: str
    user_id: int
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class QuestionListOut(BaseModel):
    total: int
    items: list[QuestionOut]

class QuestionBatchUpdate(BaseModel):
    question_ids: List[str]
    knowledge_point_id: Optional[int] = None
    year: Optional[int] = None
    difficulty: Optional[int] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    source: Optional[str] = None

class QuestionBatchDelete(BaseModel):
    question_ids: List[str]