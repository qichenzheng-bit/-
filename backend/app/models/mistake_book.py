from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class MistakeBook(Base):
    __tablename__ = "mistake_book"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String(20), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    error_reason = Column(String(100), nullable=True)       # 错因分类：计算失误/概念混淆/审题不清
    review_count = Column(Integer, default=0)
    last_reviewed = Column(DateTime, nullable=True)
    status = Column(String(20), default='active')            # active / mastered
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="mistake_books")
    question = relationship("Question")

    def __repr__(self):
        return f"<MistakeBook(id={self.id}, user_id={self.user_id}, question_id={self.question_id})>"