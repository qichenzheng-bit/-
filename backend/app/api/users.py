from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth import get_current_user, SECRET_KEY  # 导入密钥
from app.models.user import User
from app.models.user_ai_config import UserAIConfig
from app.schemas.user import ChangePassword, AIKeyCreate, AIKeyOut, AIKeyUpdate
from typing import List
import base64
from cryptography.fernet import Fernet

router = APIRouter(prefix="/users", tags=["用户"])

# ---- 加密工具：基于 SECRET_KEY 生成稳定的 Fernet 密钥 ----
def _get_fernet() -> Fernet:
    """使用 SHA256 对 SECRET_KEY 进行哈希，确保得到有效的 32 字节密钥"""
    import hashlib
    key = hashlib.sha256(SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))

def encrypt_api_key(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()

def decrypt_api_key(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()

# ---- 密码修改 ----
@router.put("/password")
def change_password(
    req: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.auth import get_password_hash, verify_password
    if not verify_password(req.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="旧密码错误")
    current_user.password_hash = get_password_hash(req.new_password)
    db.commit()
    return {"status": "success"}

# ---- AI 配置 CRUD ----
@router.get("/ai-keys", response_model=List[AIKeyOut])
def list_ai_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    configs = db.query(UserAIConfig).filter(UserAIConfig.user_id == current_user.id).all()
    return configs

@router.post("/ai-keys", response_model=AIKeyOut)
def create_ai_key(
    req: AIKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    encrypted_key = encrypt_api_key(req.api_key)
    config = UserAIConfig(
        user_id=current_user.id,
        provider=req.provider,
        api_key_encrypted=encrypted_key,
        base_url=req.base_url,
        model_name=req.model_name,
        is_active=req.is_active
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config

@router.put("/ai-keys/{config_id}", response_model=AIKeyOut)
def update_ai_key(
    config_id: int,
    req: AIKeyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = db.query(UserAIConfig).filter(
        UserAIConfig.id == config_id,
        UserAIConfig.user_id == current_user.id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    if req.api_key:
        config.api_key_encrypted = encrypt_api_key(req.api_key)
    if req.base_url is not None:
        config.base_url = req.base_url
    if req.model_name is not None:
        config.model_name = req.model_name
    if req.is_active is not None:
        config.is_active = req.is_active
        # 如果激活，关闭其他同提供商的激活
        if config.is_active:
            db.query(UserAIConfig).filter(
                UserAIConfig.user_id == current_user.id,
                UserAIConfig.provider == config.provider,
                UserAIConfig.id != config.id
            ).update({"is_active": False})
    db.commit()
    db.refresh(config)
    return config

@router.delete("/ai-keys/{config_id}")
def delete_ai_key(
    config_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = db.query(UserAIConfig).filter(
        UserAIConfig.id == config_id,
        UserAIConfig.user_id == current_user.id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(config)
    db.commit()
    return {"status": "deleted"}