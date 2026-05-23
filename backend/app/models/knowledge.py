from sqlalchemy import Column, Integer, String, Enum, ForeignKey, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from app.core.database import Base

class KnowledgePoint(Base):
    __tablename__ = "knowledge_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    stage = Column(Enum('X', 'C', 'G', 'Z', 'K', name='stage_enum'), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("knowledge_points.id", ondelete="SET NULL"), nullable=True, index=True)
    level_type = Column(Enum('chapter', 'section', 'point', name='level_type_enum'), default='point')
    sort_order = Column(Integer, default=0)
    path = Column(String(500), nullable=False, default='/', index=True)
    description = Column(Text, nullable=True)  # 知识点指导内容（LaTeX/富文本）

    children = relationship(
    "KnowledgePoint",
    backref="parent",
    remote_side=[id],
    single_parent=False,          # 改为 False，避免限制
    cascade="save-update, merge"  # 移除 delete 和 delete-orphan
)

    __table_args__ = (
        UniqueConstraint('stage', 'parent_id', 'name', name='unique_knowledge_per_parent'),
        Index('ix_knowledge_path', 'path'),
    )

    def __repr__(self):
        return f"<KnowledgePoint(id={self.id}, name={self.name}, stage={self.stage})>"