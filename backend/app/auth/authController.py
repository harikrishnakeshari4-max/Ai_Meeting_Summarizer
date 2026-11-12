
import os
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException, status
from jose import jwt
from pymongo.errors import DuplicateKeyError

from app.db.mongo_client import users_collection
from app.auth.user import (
    UserCreate,
    UserLogin,
    UserUpdate,
    make_user_document,
    normalize_email,
    safe_user,
    verify_password,
)

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"


def get_expiry_seconds() -> int:
    """Read JWT_EXPIRES_IN, supporting values such as 7d, 12h, and 30m."""
    value = os.getenv("JWT_EXPIRES_IN", "7d").strip().lower()

    units = {
        "s": 1,
        "m": 60,
        "h": 3600,
        "d": 86400,
    }

    try:
        number = int(value[:-1])
        unit = value[-1]
        if number <= 0 or unit not in units:
            raise ValueError
        return number * units[unit]
    except (ValueError, IndexError):
        raise RuntimeError(
            "JWT_EXPIRES_IN must look like 7d, 12h, or 30m"
        )


def sign_token(user_id: str) -> str:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not configured")

    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=get_expiry_seconds()
    )

    return jwt.encode(
        {
            "id": str(user_id),
            "exp": expires_at,
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


# POST /api/auth/register
async def register(data: UserCreate):
    if not data.name.strip() or not str(data.email).strip() or not data.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name, email, and password are required",
        )

    email = normalize_email(str(data.email))

    existing = await users_collection.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    document = make_user_document(data)

    try:
        result = await users_collection.insert_one(document)
    except DuplicateKeyError:
        # Also handles simultaneous registrations for the same email.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    document["_id"] = result.inserted_id

    token = sign_token(str(result.inserted_id))

    return {
        "user": safe_user(document),
        "token": token,
    }


# POST /api/auth/login
async def login(data: UserLogin):
    email = normalize_email(str(data.email))

    user = await users_collection.find_one({"email": email})

    if not user or not verify_password(
        data.password, user.get("password", "")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = sign_token(str(user["_id"]))

    return {
        "user": safe_user(user),
        "token": token,
    }


# GET /api/auth/profile
async def get_profile(user: dict):
    return {"user": safe_user(user)}


# PUT /api/auth/profile
async def update_profile(user: dict, data: UserUpdate):
    user_id = user.get("_id")

    if not user_id or not ObjectId.is_valid(str(user_id)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticated user",
        )

    updates = {}

    if data.name is not None:
        if not data.name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name cannot be empty",
            )
        updates["name"] = data.name.strip()

    if data.phone is not None:
        updates["phone"] = data.phone.strip()

    if updates:
        updates["updatedAt"] = datetime.now(timezone.utc)

        await users_collection.update_one(
            {"_id": ObjectId(str(user_id))},
            {"$set": updates},
        )

    updated_user = await users_collection.find_one(
        {"_id": ObjectId(str(user_id))}
    )

    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return {"user": safe_user(updated_user)}
