import re
import jieba
from simhash import Simhash


def normalize_latex_structure(latex: str) -> str:
    """将 LaTeX 公式中的变量、数字替换为占位符，提取结构骨架"""
    latex = re.sub(r'\s+', '', latex)
    # 数字统一为 0
    latex = re.sub(r'\d+(\.\d+)?', '0', latex)
    # 拉丁字母变量统一为 x（保留希腊字母、函数名等）
    latex = re.sub(r'\\?[a-zA-Z](\^\{[^}]*\}|\_\{[^}]*\})?', 'x', latex)
    # 恢复常见函数名
    for func in ['sin', 'cos', 'tan', 'log', 'ln', 'lim', 'int', 'sum', 'sqrt', 'frac']:
        latex = re.sub(r'\\' + func, func, latex)
    # 移除大括号，保留结构
    latex = re.sub(r'[{}]', '', latex)
    return latex


def get_structure_simhash(latex: str) -> Simhash:
    """基于结构骨架生成 Simhash"""
    structure = normalize_latex_structure(latex)
    tokens = re.split(r'([\\\$\(\)\[\]\^\_\{\}])', structure)
    tokens = [t for t in tokens if t.strip()]
    return Simhash(tokens)


def get_text_simhash(latex: str) -> Simhash:
    """基于中文文本生成 Simhash（忽略公式）"""
    text = re.sub(r'\$[^$]+\$', '', latex)
    text = re.sub(r'\\[a-zA-Z]+', '', text)
    words = jieba.lcut(text)
    words = [w.strip() for w in words if w.strip()]
    return Simhash(words)


def calculate_similarity(new_content: str, existing_content: str) -> float:
    """计算两道题目的相似度百分比（0-100）"""
    new_struct = get_structure_simhash(new_content)
    new_text = get_text_simhash(new_content)
    old_struct = get_structure_simhash(existing_content)
    old_text = get_text_simhash(existing_content)

    struct_dist = new_struct.distance(old_struct)
    text_dist = new_text.distance(old_text)

    # SimHash 位数为 64，最大距离 64
    max_dist = 64
    # 加权距离（结构 0.7，文本 0.3）
    total_dist = 0.7 * struct_dist + 0.3 * text_dist
    similarity = max(0, 100 * (1 - total_dist / max_dist))
    return round(similarity, 1)


def check_duplicate_math(
    new_content: str,
    existing_contents: list[str],
    threshold: float = 70.0
) -> list[dict]:
    """
    返回相似度 >= threshold 的题目信息列表
    每个元素为 {"index": int, "similarity": float}
    """
    results = []
    for idx, content in enumerate(existing_contents):
        sim = calculate_similarity(new_content, content)
        if sim >= threshold:
            results.append({"index": idx, "similarity": sim})
    # 按相似度从高到低排序
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results