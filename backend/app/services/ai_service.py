import base64
import json
import re
import os
from openai import OpenAI
from sqlalchemy.orm import Session
from app.models.user_ai_config import UserAIConfig
from typing import Optional

# ========== 内置默认配置（无需用户填写） ==========
BUILTIN_API_KEY = "ark-21be9f56-a3d9-4be5-99c8-52f515572ec0-7c1ea"
BUILTIN_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
VISION_MODEL = "doubao-1.5-vision-pro-32k-250115"   # 视觉模型
CHAT_MODEL = "doubao-1.5-pro-32k-250115"             # 文本模型


def _get_user_client(user_id: int, db: Session, provider: str = "doubao") -> OpenAI:
    """
    获取 OpenAI 客户端。
    优先使用用户激活的配置，否则回退到内置 Key。
    """
    config = db.query(UserAIConfig).filter(
        UserAIConfig.user_id == user_id,
        UserAIConfig.provider == provider,
        UserAIConfig.is_active == True,
    ).first()
    if config:
        from app.api.users import decrypt_api_key
        api_key = decrypt_api_key(config.api_key_encrypted)
        base_url = config.base_url or BUILTIN_BASE_URL
        return OpenAI(api_key=api_key, base_url=base_url)
    else:
        # 使用内置 Key
        return OpenAI(api_key=BUILTIN_API_KEY, base_url=BUILTIN_BASE_URL)


def _get_text_model_name(user_id: int, db: Session, provider: str = "doubao") -> str:
    """获取文本模型名称（用户配置或内置默认）"""
    config = db.query(UserAIConfig).filter(
        UserAIConfig.user_id == user_id,
        UserAIConfig.provider == provider,
        UserAIConfig.is_active == True,
    ).first()
    if config and config.model_name:
        return config.model_name
    return CHAT_MODEL


# ---------- LaTeX 标准化 ----------
def normalize_latex(latex: str) -> str:
    latex = re.sub(r'\\documentclass.*?\n', '', latex)
    latex = re.sub(r'\\usepackage.*?\n', '', latex)
    latex = re.sub(r'\\begin\{document\}', '', latex)
    latex = re.sub(r'\\end\{document\}', '', latex)

    stripped = latex.strip()
    if stripped.startswith('$') and stripped.endswith('$') and '\n' not in stripped:
        inner = stripped[1:-1].strip()
        inner = re.sub(r'([A-D])\.\s', r'\n\1. ', inner)
        latex = inner.strip()

    if re.search(r'(?:^|\n)\s*(?:\(\d+\)|第\d+小题)', latex):
        latex = re.sub(r'主题干[：:]\s*', '', latex)
        latex = re.sub(r'第\s*(\d+)\s*小题[：:]*\s*', r'(\1) ', latex)
        latex = re.sub(r'\(\s*(\d+)\s*\)\s*', r'(\1) ', latex)
        lines = latex.strip().split('\n')
        result_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if re.match(r'\(\d+\)', line):
                result_lines.append(line)
            else:
                if not result_lines:
                    result_lines.append(line)
                elif not re.match(r'\(\d+\)', result_lines[-1]):
                    result_lines[-1] += ' ' + line
                else:
                    result_lines.append(line)
        if result_lines:
            return '\n'.join(result_lines).strip()

    stem = ""
    items = []
    enum_match = re.search(r'(.*?)\\begin\{enumerate\}.*?\n(.*?)\\end\{enumerate\}', latex, re.DOTALL)
    if enum_match:
        stem = enum_match.group(1).strip()
        options_block = enum_match.group(2).strip()
        items = re.findall(r'\\item\s+(.*)', options_block)

    if not items:
        lines = latex.strip().split('\n')
        stem_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if re.match(r'^(\$?[A-D]\$?\.?\s)', line):
                items.append(line)
            else:
                stem_lines.append(line)
        stem = '\n'.join(stem_lines) if stem_lines else stem

    if not items:
        return latex.strip()

    stem = stem.strip()
    labels = ['A', 'B', 'C', 'D']
    result = stem + '\n\n'
    for idx, item in enumerate(items):
        label = labels[idx] if idx < len(labels) else str(idx+1)
        result += f'{label}. {item.strip()}\n'
    return result.strip()


# ---------- AI 识别图片（OCR）----------
def ocr_image_to_latex(image_path: str, user_id: int, db: Session) -> str:
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    prompt = r"""Convert the math problem in the image to LaTeX code.
**CRITICAL RULES**:
1. Output ONLY the problem statement and its options (if any). Do NOT include any solutions, answers, analysis, or repeating content.
2. Output at most 4 option lines (A. B. C. D.) for multiple-choice. Never repeat options.
3. For multi-part questions, output at most 5 sub-questions.
4. Total output must be less than 1000 characters.
5. Preserve the original language.
6. Use $...$ for inline formulas.
"""
    client = _get_user_client(user_id, db)
    # 强制使用视觉模型
    response = client.chat.completions.create(
        model=VISION_MODEL,
        messages=[{"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}]}]
    )
    return normalize_latex(response.choices[0].message.content)


# ---------- AI 打标 ----------
def suggest_tags(latex_content: str, user_id: int, db: Session) -> dict:
    prompt = rf"""Analyze the following LaTeX math problem and return a JSON with:
{{
  "knowledge": "one of: 代数, 几何, 函数, 三角, 概率统计, 数列, 导数, 积分, 解析几何, 向量",
  "difficulty": integer 1-5
}}
Problem:
{latex_content}
Only return JSON.
"""
    client = _get_user_client(user_id, db)
    model = _get_text_model_name(user_id, db)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )
    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        return {"knowledge": "未知", "difficulty": 3}


# ---------- AI 修复 LaTeX ----------
def fix_latex(latex_content: str, user_id: int, db: Session) -> str:
    prompt = rf"""Fix the following LaTeX code to make it standard and professional:
1. Replace sin, cos, tan, log, ln, lim, max, min with \sin, \cos, \tan, \log, \ln, \lim, \max, \min.
2. Ensure curly braces {{}} are matched.
3. Ensure math mode $...$ is correct.
4. Do NOT change content or language.
5. Return ONLY the fixed LaTeX code, no explanations.

Input:
{latex_content}
"""
    client = _get_user_client(user_id, db)
    model = _get_text_model_name(user_id, db)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1
    )
    return response.choices[0].message.content


# ---------- 批量打标 ----------
def batch_suggest_tags(question_contents: list[str], user_id: int, db: Session) -> list[dict]:
    return [suggest_tags(c, user_id, db) for c in question_contents]


def generate_answer_analysis(content_latex: str, user_id: int, db: Session) -> dict:
    prompt = rf"""你是一位资深数学教师。请根据以下数学题目生成标准答案和详细解析。

题目：
{content_latex}

请**仅返回**一个 JSON 对象，格式如下（不要包含任何其他文字）：
{{
  "answer": "标准答案（LaTeX 格式）",
  "analysis": "详细解析，包含解题思路、关键步骤、易错点（可使用 LaTeX）"
}}
"""
    client = _get_user_client(user_id, db)
    model = _get_text_model_name(user_id, db)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )
    content = response.choices[0].message.content.strip()
    # 尝试提取 JSON
    if not content.startswith('{'):
        # 可能被包裹在 ```json ... ``` 中
        import re
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            content = match.group(0)
    try:
        result = json.loads(content)
        return result
    except json.JSONDecodeError:
        return {"answer": "", "analysis": ""}

# ---------- 智能分题 ----------
def split_text_to_questions(text: str, user_id: int = None, db: Session = None) -> list[dict]:
    text = re.sub(r'\n\s*\n', '\n', text)
    blocks = re.split(r'\n(?=\d+[\.\)、])', text)
    if len(blocks) <= 1:
        blocks = re.split(r'\n(?=[A-D]\.)', text)
    questions = []
    for block in blocks:
        block = block.strip()
        if not block or len(block) < 5:
            continue
        questions.append({
            "raw_text": block,
            "latex": normalize_latex(block)
        })
    return questions