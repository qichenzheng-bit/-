from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # 关系
    ai_configs = relationship("UserAIConfig", back_populates="user", cascade="all, delete-orphan")
    questions = relationship("Question", back_populates="user", cascade="all, delete-orphan")
    papers = relationship("Paper", back_populates="user", cascade="all, delete-orphan")
    mistake_books = relationship("MistakeBook", back_populates="user", cascade="all, delete-orphan")
    daily_questions = relationship("DailyQuestion", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, username={self.username})>"