from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.schemas.user import UserRegister, UserLogin, TokenResponse
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["认证"])

@router.post("/register", response_model=TokenResponse)
def register(req: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(username=req.username, password_hash=get_password_hash(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(data={"sub": str(user.id)})   # 字符串类型
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login", response_model=TokenResponse)
def login(req: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token(data={"sub": str(user.id)})   # 字符串类型
    return {"access_token": token, "token_type": "bearer"}

@router.post("/logout")
def logout():
    return {"status": "ok"}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username}