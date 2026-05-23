from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime

class PaperCreate(BaseModel):
    title: str
    paper_type: str = Field(..., pattern="^(试卷|讲义|教辅|教材|错题本|每日一题)$")
    stage: str = Field(..., pattern="^(X|C|G|Z|K)$")
    answer_mode: str = Field(default="teacher", pattern="^(student|teacher|answer_only)$")
    meta_info: Optional[Any] = None  # JSON

class PaperUpdate(BaseModel):
    title: Optional[str] = None
    answer_mode: Optional[str] = None
    meta_info: Optional[Any] = None
    total_score: Optional[int] = None

class PaperOut(BaseModel):
    id: int
    user_id: int
    title: str
    paper_type: str
    stage: str
    total_score: Optional[int] = 0
    answer_mode: str
    meta_info: Optional[Any] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class PaperQuestionOut(BaseModel):
    id: int
    paper_id: int
    question_id: Optional[str] = None
    score: int
    sort_order: int
    text_content: Optional[str] = None
    is_text: int = 0
    is_knowledge_block: int = 0
    # 额外展示
    content_preview: Optional[str] = None

    class Config:
        from_attributes = True

class AddQuestionToPaper(BaseModel):
    question_id: Optional[str] = None
    score: int = 0
    sort_order: int = 0
    is_text: int = 0
    text_content: Optional[str] = None
    is_knowledge_block: int = 0

class UpdatePaperQuestion(BaseModel):
    score: Optional[int] = None
    sort_order: Optional[int] = None