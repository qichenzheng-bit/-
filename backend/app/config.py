import os
from dotenv import load_dotenv

# 加载项目根目录的 .env
env_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(env_path)

_default_db = "sqlite:///" + os.path.join(os.path.dirname(__file__), '..', 'app', 'data', 'mathpulse.db')
DATABASE_URL = os.getenv("DATABASE_URL", _default_db)
os.makedirs(os.path.dirname(_default_db.split("///")[1]), exist_ok=True)

DEFAULT_DOUBAO_BASE_URL = os.getenv("DEFAULT_DOUBAO_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
DEFAULT_DOUBAO_MODEL = os.getenv("DEFAULT_DOUBAO_MODEL", "doubao-1.5-pro-32k-250115")
DEFAULT_VISION_MODEL = os.getenv("DEFAULT_VISION_MODEL", "doubao-1.5-vision-pro-32k-250115")