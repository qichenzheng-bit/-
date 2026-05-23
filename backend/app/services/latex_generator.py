import os, json, re
from sqlalchemy.orm import Session
from app.models.paper import Paper, PaperQuestion
from app.models.question import Question

TEMPLATE_DIR = r"D:\tikuxitong\tikuguanlixitong\MathPulse\templates"

TEMPLATE_MAP = {
    "exam_primary": "exam_primary.tex",
    "exam_junior": "exam_junior.tex",
    "exam_senior": "exam_senior.tex",
    "exam_college": "exam_college.tex",
    "exam": "exam_primary.tex",
    "elegantbook": "elegantbook_template.tex",
    "tutorial": "tutorial_template.tex",
    "textbook": "textbook_template.tex",
    "mistake_book": "mistake_book_template.tex",
    "daily_card": "daily_card_template.tex",
    "answer_sheet": "answer_sheet_template.tex",
}

STAGE_TEMPLATE = {
    'X': 'exam_primary',
    'C': 'exam_junior',
    'G': 'exam_senior',
    'Z': 'exam_college',
    'K': 'exam_college',
}

# 知识单元类型 → ElegantBook 环境映射
KU_ENV_MAP = {
    '定义': 'definition',
    '定理': 'theorem',
    '引理': 'lemma',
    '推论': 'corollary',
    '命题': 'proposition',
    '公理': 'axiom',
    '性质': 'property',
    '注释': 'note',
    '评注': 'remark',
    '结论': 'conclusion',
    '例题': 'example',       # 示例类
    '练习': 'exercise',
    '问题': 'problem',
}

def load_template(template_name: str) -> str:
    filename = TEMPLATE_MAP.get(template_name)
    if not filename:
        raise FileNotFoundError(f"未知模板名称: {template_name}")
    template_path = os.path.join(TEMPLATE_DIR, filename)
    print(f"[DEBUG] 加载模板: {template_path}")
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"模板文件不存在: {template_path}")


def generate_latex(paper_id: int, db: Session, mode: str = "teacher", template: str = "exam") -> str:
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise ValueError("组卷不存在")

    if template == "exam":
        if paper.paper_type == "讲义":
            actual_template = "elegantbook"
        elif paper.paper_type == "教辅":
            actual_template = "tutorial"
        elif paper.paper_type == "教材":
            actual_template = "textbook"
        elif paper.paper_type == "错题本":
            actual_template = "mistake_book"
        elif paper.paper_type == "每日一题":
            actual_template = "daily_card"
        else:
            actual_template = STAGE_TEMPLATE.get(paper.stage, "exam_primary")
    else:
        actual_template = template

    print(f"[DEBUG] paper_type={paper.paper_type}, actual_template={actual_template}")

    template_content = load_template(actual_template)

    items = db.query(PaperQuestion).filter(
        PaperQuestion.paper_id == paper_id
    ).order_by(PaperQuestion.sort_order).all()

    question_latex_list = []
    question_counter = 0

    show_score = True
    if paper.meta_info:
        try:
            meta = json.loads(paper.meta_info)
            if 'show_score' in meta:
                show_score = meta['show_score']
        except:
            pass

    for item in items:
        # 文本块 / 知识点讲解块
        if item.is_text or item.is_knowledge_block:
            block_title = "知识点讲解" if item.is_knowledge_block else "备注"
            question_latex_list.append(
                f"\\subsection*{{{block_title}}}\n{item.text_content}\n"
            )
            continue

        if not item.question_id:
            continue

        q = db.query(Question).filter(Question.id == item.question_id).first()
        if not q:
            continue

        # ---- 判断是否为知识单元（定理、定义等） ----
        is_ku = q.question_type in KU_ENV_MAP and q.question_type not in ('例题', '练习', '问题')
        is_example = q.question_type in ('例题', '练习', '问题')

        if is_ku:
            env_name = KU_ENV_MAP.get(q.question_type, 'note')
            ku_block = f"\\begin{{{env_name}}}\n{q.content_latex}\n\\end{{{env_name}}}\n"
            question_latex_list.append(ku_block)
            continue

        # 以下为题目块（原逻辑）
        question_counter += 1
        idx = question_counter
        score = item.score if (item.score is not None and item.score > 0) else max(q.difficulty * 2, 2)
        content = q.content_latex

        # 选择题拼接
        if q.question_type == "选择" and q.options_latex:
            try:
                opts = json.loads(q.options_latex)
                if opts and len(opts) > 0:
                    labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
                    opt_lines = []
                    for i, opt in enumerate(opts):
                        if opt:
                            clean_opt = opt.lstrip('ABCDEFGHIJ. ')
                            opt_lines.append(f"{labels[i]}. {clean_opt}")
                    if opt_lines:
                        content += "\n\n" + " \\\\\n".join(opt_lines)
            except:
                pass

        # 填空题下划线包裹
        def wrap_underline(text):
            parts = []
            last = 0
            pattern = re.compile(r'(\$[^$]+\$|\\underline\{[^}]*\})')
            for match in pattern.finditer(text):
                start, end = match.span()
                parts.append(text[last:start])
                token = text[start:end]
                if token.startswith('$'):
                    parts.append(token)
                else:
                    parts.append('$' + token + '$')
                last = end
            parts.append(text[last:])
            return ''.join(parts)
        content = wrap_underline(content)

        # 综合大题子题
        sub_answer = ""
        sub_analysis = ""
        if q.question_type == "综合大题" and q.answer_latex:
            try:
                subs = json.loads(q.answer_latex)
                if subs:
                    if actual_template == "tutorial":
                        sub_stems = []
                        sub_answers = []
                        sub_analyses = []
                        for i, sub in enumerate(subs):
                            sub_stems.append(f"({i+1}) {sub.get('stem', '')}")
                            sub_answers.append(f"({i+1}) {sub.get('answer', '')}")
                            if sub.get('analysis'):
                                sub_analyses.append(f"({i+1}) {sub.get('analysis', '')}")
                        if mode != "answer_only":
                            content += "\n\n" + " \\\\\n".join(sub_stems)
                        if mode == "teacher":
                            sub_answer = "\n\n\\textbf{答案：}\n" + " \\\\\n".join(sub_answers) if sub_answers else ""
                            sub_analysis = "\n\n\\textbf{解析：}\n" + " \\\\\n".join(sub_analyses) if sub_analyses else ""
                        elif mode == "answer_only":
                            question_latex_list.append(" \\\\\n".join(sub_answers))
                            continue
                    else:
                        sub_lines = []
                        analysis_lines = []
                        for i, sub in enumerate(subs):
                            sub_lines.append(f"({i+1}) {sub.get('stem', '')}")
                            if mode != "student":
                                sub_lines.append(f"\\textbf{{答案：}} {sub.get('answer', '')}")
                            if sub.get('analysis') and mode == "teacher":
                                analysis_lines.append(f"({i+1}) {sub.get('analysis', '')}")
                        if mode == "student":
                            content += "\n\n" + " \\\\\n".join(sub_lines)
                        elif mode == "teacher":
                            content += "\n\n" + " \\\\\n".join(sub_lines)
                            if analysis_lines:
                                sub_analysis = "\n\n\\textbf{解析：}\n" + " \\\\\n".join(analysis_lines)
                        else:
                            answer_only_lines = [f"({i+1}) {sub.get('answer', '')}" for i, sub in enumerate(subs)]
                            question_latex_list.append(" \\\\\n".join(answer_only_lines))
                            continue
            except:
                pass

        # 分值显示
        score_display = f" ({score}分)" if show_score else ""

        if mode == "student":
            answer_part = ""
            analysis_part = ""
        elif mode == "teacher":
            if q.question_type == "综合大题":
                answer_part = sub_answer
                analysis_part = sub_analysis
            else:
                answer_part = f"\n\n\\textbf{{答案：}} {q.answer_latex or ''}" if q.answer_latex else ""
                analysis_part = f"\n\n\\textbf{{解析：}} {q.analysis_latex or ''}" if q.analysis_latex else ""
        else:
            if q.question_type != "综合大题":
                answer_part = f"\\textbf{{{idx}. }} {q.answer_latex or ''}\\newline" if q.answer_latex else ""
                analysis_part = f"{q.analysis_latex or ''}\\newline" if q.analysis_latex else ""
                question_latex_list.append(answer_part + analysis_part)
                continue

        question_block = f"""
\\setcounter{{enumi}}{{{idx-1}}}
\\begin{{enumerate}}[label=\\arabic*., start={idx}]
\\item {content}{score_display}
{answer_part}
{analysis_part}
\\end{{enumerate}}
"""
        question_latex_list.append(question_block)

    latex_doc = template_content.replace("{TITLE}", paper.title)
    latex_doc = latex_doc.replace("{TOTAL_SCORE}", str(paper.total_score))
    latex_doc = latex_doc.replace("{QUESTIONS}", "\n".join(question_latex_list))

    if paper.meta_info:
        try:
            meta = json.loads(paper.meta_info)
            for key, value in meta.items():
                latex_doc = latex_doc.replace(f"{{{key.upper()}}}", str(value))
        except:
            pass

    return latex_doc