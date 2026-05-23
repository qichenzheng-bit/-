from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    paper_type = Column(Enum('试卷', '讲义', '教辅', '教材', '错题本', '每日一题', '其他', name='paper_type_enum'), nullable=False)
    stage = Column(Enum('X', 'C', 'G', 'Z', 'K', name='stage_enum'), nullable=False, index=True)
    total_score = Column(Integer, nullable=True, default=0)
    answer_mode = Column(Enum('student', 'teacher', 'answer_only', name='answer_mode_enum'), default='teacher')
    meta_info = Column(Text, nullable=True)  # JSON: 年份、学校、考试时间等元数据
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="papers")
    questions = relationship("PaperQuestion", back_populates="paper", cascade="all, delete-orphan", order_by="PaperQuestion.sort_order")

    def __repr__(self):
        return f"<Paper(id={self.id}, title={self.title}, type={self.paper_type})>"


class PaperQuestion(Base):
    __tablename__ = "paper_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String(20), ForeignKey("questions.id", ondelete="SET NULL"), nullable=True)
    score = Column(Integer, default=0)
    sort_order = Column(Integer, default=0)
    text_content = Column(Text, nullable=True)   # 文本块内容（用于知识点讲解等）
    is_text = Column(Integer, default=0)          # 0=题目 1=文本块
    is_knowledge_block = Column(Integer, default=0)  # 0=普通 1=知识点讲解块

    paper = relationship("Paper", back_populates="questions")
    question = relationship("Question", back_populates="paper_questions")

    def __repr__(self):
        return f"<PaperQuestion(id={self.id}, paper_id={self.paper_id}, question_id={self.question_id})>"