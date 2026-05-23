# backend/app/core/id_generator.py

from datetime import datetime
from app.models.question import Question

def generate_question_id(stage: str, db, user_id: int) -> str:
    year = datetime.now().year
    prefix = f"{stage}{year}"
    last = db.query(Question.id).filter(
        Question.user_id == user_id,
        Question.id.like(f"{prefix}%")
    ).order_by(Question.id.desc()).first()
    seq = 0
    if last:
        try:
            seq = int(last.id[-4:])
        except:
            seq = 0
    max_attempts = 10
    for _ in range(max_attempts):
        seq += 1
        new_id = f"{prefix}{str(seq).zfill(4)}"
        if not db.query(Question).filter(Question.id == new_id).first():
            return new_id
    raise ValueError("编号生成失败，请重试")