
import os

from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from app.db.mongo_client import users_collection

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

security = HTTPBearer(auto_error=False)


async def protect(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    # Require a Bearer token
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized, no token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not configured")

    try:
        token = credentials.credentials

        decoded = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = decoded.get("id")

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token: user ID missing",
            )

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Not authorized, invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Retrieve user from MongoDB
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=401,
            detail="Not authorized, user not found",
        )

    user = await users_collection.find_one(
        {"_id": ObjectId(user_id)},
        {"password": 0},
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Not authorized, user not found",
        )

    # Attach the user to the route through dependency injection
    user["_id"] = str(user["_id"])
    return user


async def admin_only(user: dict = Depends(protect)):
    # Must run after protect
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return user
