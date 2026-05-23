from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class UserAIConfig(Base):
    __tablename__ = "user_ai_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(50), nullable=False)           # doubao, openai, ollama, pix2text
    api_key_encrypted = Column(Text, nullable=False)        # AES加密存储
    base_url = Column(String(255), nullable=True)
    model_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="ai_configs")

    def __repr__(self):
        return f"<UserAIConfig(id={self.id}, provider={self.provider}, active={self.is_active})>"