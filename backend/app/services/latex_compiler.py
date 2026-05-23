import subprocess
import os
import shutil
import tempfile
import re

def compile_latex_to_pdf(latex_content: str, filename: str = "output") -> str:
    temp_dir = tempfile.mkdtemp()
    tex_path = os.path.join(temp_dir, f"{filename}.tex")
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(latex_content)

    # 设置 TEXINPUTS 环境变量，使 pdflatex 能找到 elegantbook.cls 等文件
    env = os.environ.copy()
    template_dir = r"D:\tikuxitong\tikuguanlixitong\MathPulse\templates"
    env["TEXINPUTS"] = f"{template_dir};" + env.get("TEXINPUTS", "")

    try:
        for _ in range(2):
            subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-output-directory", temp_dir, tex_path],
                capture_output=True, text=True, timeout=60,
                encoding='utf-8', errors='replace', env=env
            )
        pdf_path = os.path.join(temp_dir, f"{filename}.pdf")
        if not os.path.exists(pdf_path):
            log_file = os.path.join(temp_dir, f"{filename}.log")
            error_msg = "LaTeX 编译失败"
            if os.path.exists(log_file):
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    log_content = f.read()
                    errors = re.findall(r"! (.+)", log_content)
                    if errors:
                        error_msg = "LaTeX 错误: " + "; ".join(errors[:3])
            raise RuntimeError(error_msg)
        final_path = os.path.join(tempfile.gettempdir(), f"mathpulse_{filename}.pdf")
        shutil.copy(pdf_path, final_path)
        shutil.rmtree(temp_dir, ignore_errors=True)
        return final_path
    except subprocess.TimeoutExpired:
        raise RuntimeError("PDF 编译超时")
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(f"编译异常: {str(e)}")


def latex_to_docx_via_pandoc(latex_content: str, filename: str = "output") -> str:
    temp_dir = tempfile.mkdtemp()
    tex_path = os.path.join(temp_dir, f"{filename}.tex")
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(latex_content)

    docx_path = os.path.join(temp_dir, f"{filename}.docx")
    try:
        subprocess.run(
            ["pandoc", tex_path, "-o", docx_path, "--from=latex", "--to=docx"],
            capture_output=True, text=True, timeout=60,
            encoding='utf-8', errors='replace'
        )
        if not os.path.exists(docx_path):
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise RuntimeError("Pandoc 转换失败，请确认已安装 pandoc: https://pandoc.org")
        final_path = os.path.join(tempfile.gettempdir(), f"mathpulse_{filename}.docx")
        shutil.copy(docx_path, final_path)
        shutil.rmtree(temp_dir, ignore_errors=True)
        return final_path
    except FileNotFoundError:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError("Pandoc 未安装，请访问 https://pandoc.org 安装")
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(f"Word 转换失败: {str(e)}")