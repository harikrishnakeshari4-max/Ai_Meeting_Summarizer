
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pwdlib import PasswordHash
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

password_hash = PasswordHash.recommended()


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    password: str = Field(..., min_length=6)
    phone: str = ""


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    phone: Optional[str] = None


class UserSafe(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone: str = ""
    role: Literal["user", "admin"] = "user"
    createdAt: datetime


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    candidate: str,
    hashed_password: str,
) -> bool:
    return password_hash.verify(candidate, hashed_password)


def safe_user(user: dict) -> dict:
    """Return public user data without the password hash."""
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "phone": user.get("phone", ""),
        "role": user.get("role", "user"),
        "createdAt": user["createdAt"],
    }


def make_user_document(data: UserCreate) -> dict:
    now = datetime.now(timezone.utc)

    return {
        "name": data.name.strip(),
        "email": normalize_email(str(data.email)),
        "password": hash_password(data.password),
        "phone": data.phone.strip(),
        "role": "user",
        "createdAt": now,
        "updatedAt": now,
    }
