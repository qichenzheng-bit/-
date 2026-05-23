from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class DailyQuestion(Base):
    __tablename__ = "daily_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String(20), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    date_shown = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    was_answered = Column(Integer, default=0)  # 0=未做 1=已做
    answer_correct = Column(Integer, nullable=True)  # 0=错 1=对

    user = relationship("User", back_populates="daily_questions")
    question = relationship("Question")

    def __repr__(self):
        return f"<DailyQuestion(id={self.id}, user_id={self.user_id}, date={self.date_shown})>"