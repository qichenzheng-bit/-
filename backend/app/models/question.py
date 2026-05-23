from sqlalchemy import Column, String, Text, Integer, DateTime, Enum, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        Index('ix_questions_stage_type', 'stage', 'question_type'),
        Index('ix_questions_deleted', 'deleted_at'),
        Index('ix_questions_user', 'user_id'),
    )

    id = Column(String(20), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    stage = Column(Enum('X', 'C', 'G', 'Z', 'K', name='stage_enum'), nullable=False, index=True)
    category = Column(Enum('试卷', '讲义', '教辅', '其他', name='category_enum'), nullable=False, default='试卷')

    # 扩展枚举，加入知识单元类型（以 "ku_" 前缀标识）
    question_type = Column(
        Enum(
            # 原题目类型
            '选择', '填空', '判断', '简答', '综合大题',
            # 知识单元类型
            '定义', '定理', '引理', '推论', '命题', '公理',
            '性质', '注释', '评注', '结论',
            # 示例/习题类型（可被组卷当做“题目”使用）
            '例题', '练习', '问题',
            name='question_type_enum'
        ),
        nullable=False
    )

    knowledge_point_id = Column(Integer, ForeignKey("knowledge_points.id", ondelete="SET NULL"), nullable=True, index=True)
    content_latex = Column(Text, nullable=False)
    options_latex = Column(Text, nullable=True)
    answer_latex = Column(Text, nullable=True)
    analysis_latex = Column(Text, nullable=True)
    parent_id = Column(String(20), nullable=True, index=True)
    knowledge_point = Column(String(200), nullable=True)
    difficulty = Column(Integer, default=3)
    year = Column(Integer, nullable=True)
    source = Column(String(200), nullable=True)
    tags = Column(Text, nullable=True)
    status = Column(String(20), default='已完成')
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True, index=True)

    user = relationship("User", back_populates="questions")
    knowledge_point_rel = relationship("KnowledgePoint", foreign_keys=[knowledge_point_id])
    paper_questions = relationship("PaperQuestion", back_populates="question", cascade="all, delete-orphan")

    def is_knowledge_unit(self):
        """判断是否为知识单元类型"""
        ku_types = {'定义', '定理', '引理', '推论', '命题', '公理', '性质', '注释', '评注', '结论'}
        return self.question_type in ku_types

    def __repr__(self):
        return f"<Question(id={self.id}, type={self.question_type})>"