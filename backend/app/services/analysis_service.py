from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.paper import Paper, PaperQuestion
from app.models.question import Question
from app.models.knowledge import KnowledgePoint
from collections import Counter
from typing import Optional
import json, re


def analyze_single_paper(paper_id: int, db: Session) -> dict:
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise ValueError("组卷不存在")

    pq_list = db.query(PaperQuestion).filter(
        PaperQuestion.paper_id == paper_id,
        PaperQuestion.is_text == 0,
    ).order_by(PaperQuestion.sort_order).all()

    if not pq_list:
        return {"error": "组卷中没有题目"}

    knowledge_counter = Counter()
    type_counter = Counter()
    difficulties = []

    for pq in pq_list:
        q = db.query(Question).filter(Question.id == pq.question_id).first()
        if not q:
            continue
        knowledge_counter[q.knowledge_point or "未分类"] += 1
        type_counter[q.question_type] += 1
        difficulties.append(q.difficulty)

    total = sum(knowledge_counter.values())
    return {
        "paper_title": paper.title,
        "total_questions": total,
        "knowledge_distribution": [
            {"name": k, "count": v, "percentage": round(v / total * 100, 1) if total else 0}
            for k, v in knowledge_counter.most_common()
        ],
        "type_distribution": [
            {"name": k, "count": v} for k, v in type_counter.items()
        ],
        "difficulty_avg": round(sum(difficulties) / len(difficulties), 2) if difficulties else 0
    }


def compare_papers(paper_ids: list[int], db: Session) -> dict:
    papers_data = []
    for pid in paper_ids:
        paper = db.query(Paper).filter(Paper.id == pid).first()
        if not paper:
            continue
        pq_list = db.query(PaperQuestion).filter(
            PaperQuestion.paper_id == pid,
            PaperQuestion.is_text == 0,
        ).all()
        if not pq_list:
            continue

        knowledge_counter = Counter()
        type_counter = Counter()
        difficulties = []
        for pq in pq_list:
            q = db.query(Question).filter(Question.id == pq.question_id).first()
            if not q:
                continue
            knowledge_counter[q.knowledge_point or "未分类"] += 1
            type_counter[q.question_type] += 1
            difficulties.append(q.difficulty)

        total = sum(knowledge_counter.values())
        papers_data.append({
            "paper_id": pid,
            "paper_title": paper.title,
            "total_questions": total,
            "knowledge": {k: v for k, v in knowledge_counter.items()},
            "types": {k: v for k, v in type_counter.items()},
            "difficulty_avg": round(sum(difficulties) / len(difficulties), 2) if difficulties else 0
        })

    all_knowledge = set()
    for p in papers_data:
        all_knowledge.update(p["knowledge"].keys())

    labels = sorted(all_knowledge)
    datasets = []
    for p in papers_data:
        datasets.append({
            "label": p["paper_title"],
            "data": [p["knowledge"].get(k, 0) for k in labels]
        })

    return {
        "labels": labels,
        "datasets": datasets,
        "papers": papers_data
    }


def get_dashboard_stats(stage: Optional[str] = None, db: Session = None, user_id: int = None) -> dict:
    query = db.query(Question).filter(Question.deleted_at == None, Question.user_id == user_id)
    if stage:
        query = query.filter(Question.stage == stage)

    total = query.count()
    if total == 0:
        return {
            "total_questions": 0,
            "type_distribution": [],
            "difficulty_distribution": [],
            "knowledge_coverage": []
        }

    type_rows = query.with_entities(Question.question_type, func.count()).group_by(Question.question_type).all()
    type_distribution = [{"name": row[0], "count": row[1]} for row in type_rows]

    diff_rows = query.with_entities(Question.difficulty, func.count()).group_by(Question.difficulty).all()
    difficulty_distribution = [{"difficulty": row[0], "count": row[1]} for row in diff_rows]

    kp_rows = query.with_entities(Question.knowledge_point, func.count()).filter(
        Question.knowledge_point != None
    ).group_by(Question.knowledge_point).all()
    knowledge_coverage = [{"name": row[0] or "未分类", "count": row[1]} for row in kp_rows]
    knowledge_coverage.sort(key=lambda x: x["count"], reverse=True)

    return {
        "total_questions": total,
        "type_distribution": type_distribution,
        "difficulty_distribution": difficulty_distribution,
        "knowledge_coverage": knowledge_coverage
    }


def find_similar_questions(paper_id: int, db: Session) -> dict:
    # 导入 AI 客户端和模型获取函数
    from app.services.ai_service import _get_user_client, _get_text_model_name

    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise ValueError("组卷不存在")

    pq_list = db.query(PaperQuestion).filter(
        PaperQuestion.paper_id == paper_id,
        PaperQuestion.is_text == 0
    ).order_by(PaperQuestion.sort_order).all()

    if len(pq_list) < 2:
        return {"error": "组卷中至少需要两道题目才能进行类比分析"}

    questions_data = []
    for pq in pq_list:
        q = db.query(Question).filter(Question.id == pq.question_id).first()
        if q:
            questions_data.append({
                "id": q.id,
                "content": q.content_latex,
                "knowledge": q.knowledge_point or "未分类"
            })

    if len(questions_data) < 2:
        return {"error": "有效题目不足两道"}

    prompt = r"""分析以下数学题目的解题步骤结构，找出解题逻辑高度相似的题目对。

对每道题，先提取其核心解题步骤（用1-2句话概括每个关键步骤），然后比较所有题目之间的相似性。

返回 JSON 格式，确保 JSON 中的字符串内不要包含未转义的反斜杠：
{
  "pairs": [
    {"question1": "题目ID1", "question2": "题目ID2", "similarity": 85, "reason": "相似原因简述"},
    ...
  ],
  "analysis": {
    "题目ID1": ["步骤1", "步骤2", ...],
    ...
  }
}

只返回 JSON，不要其他内容。

题目列表：
"""
    for q in questions_data:
        prompt += f"\n[{q['id']}] {q['content']}"

    user_id = paper.user_id
    client = _get_user_client(user_id, db)
    model = _get_text_model_name(user_id, db)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )

    text = response.choices[0].message.content
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        json_start = text.find('{')
        json_end = text.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            raw_json = text[json_start:json_end]
            raw_json = re.sub(r'(?<!\\)\\(?=[^"\\/bfnrtu])', r'\\\\', raw_json)
            try:
                result = json.loads(raw_json)
            except json.JSONDecodeError:
                return {"error": "AI 分析结果解析失败", "raw": text[:500]}
        else:
            return {"error": "AI 分析结果解析失败", "raw": text[:500]}

    knowledge_map = {q["id"]: q["knowledge"] for q in questions_data}
    for pair in result.get("pairs", []):
        pair["knowledge1"] = knowledge_map.get(pair.get("question1"), "")
        pair["knowledge2"] = knowledge_map.get(pair.get("question2"), "")

    return result


def trace_question_in_papers(question_id: str, db: Session) -> list[dict]:
    pqs = db.query(PaperQuestion).filter(
        PaperQuestion.question_id == question_id,
        PaperQuestion.is_text == 0,
    ).all()
    results = []
    for pq in pqs:
        paper = db.query(Paper).filter(Paper.id == pq.paper_id).first()
        if paper:
            results.append({
                "paper_id": paper.id,
                "paper_title": paper.title,
                "paper_type": paper.paper_type,
                "sort_order": pq.sort_order,
                "score": pq.score,
            })
    return results


def detect_duplicate_questions_across_papers(paper_ids: list[int], db: Session) -> dict:
    paper_questions = {}
    for pid in paper_ids:
        items = db.query(PaperQuestion).filter(
            PaperQuestion.paper_id == pid,
            PaperQuestion.is_text == 0,
        ).all()
        qids = [it.question_id for it in items if it.question_id]
        paper_questions[pid] = set(qids)

    duplicates = []
    checked = set()
    for i, pid1 in enumerate(paper_ids):
        for pid2 in paper_ids[i+1:]:
            common = paper_questions[pid1] & paper_questions[pid2]
            if common:
                duplicates.append({
                    "paper1": pid1,
                    "paper2": pid2,
                    "common_question_ids": list(common),
                    "count": len(common)
                })

    return {"duplicate_groups": duplicates, "total_duplicates": sum(d["count"] for d in duplicates)}