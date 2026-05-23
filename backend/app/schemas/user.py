from pydantic import BaseModel, Field
from typing import Optional

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)

class UserLogin(BaseModel):
    username: str
    password: str
    remember: bool = False  # 是否延长 Token 有效期

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    username: str
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class ChangePassword(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=100)

class AIKeyCreate(BaseModel):
    provider: str = Field(..., description="如 doubao, openai, ollama")
    api_key: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    is_active: bool = False

class AIKeyOut(BaseModel):
    id: int
    provider: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class AIKeyUpdate(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    is_active: Optional[bool] = None