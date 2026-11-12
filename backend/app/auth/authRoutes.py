
from fastapi import APIRouter, Depends

from app.auth.auth import protect
from app.auth.authController import (
    register,
    login,
    get_profile,
    update_profile,
)
from app.auth.user import UserCreate, UserLogin, UserUpdate

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", status_code=201)
async def register_route(data: UserCreate):
    return await register(data)


@router.post("/login")
async def login_route(data: UserLogin):
    return await login(data)


@router.get("/profile")
async def profile_route(user: dict = Depends(protect)):
    return await get_profile(user)


@router.put("/profile")
async def update_profile_route(
    data: UserUpdate,
    user: dict = Depends(protect),
):
    return await update_profile(user, data)
