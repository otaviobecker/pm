"""The member directory, self-service profile routes, and administration."""

from fastapi import APIRouter, Response, status

from app.auth import AdminUser, AuthenticatedUser, clear_session_cookie
from app.models import (
    AdminUserUpdateRequest,
    ChangePasswordRequest,
    DirectoryUserResponse,
    UpdateProfileRequest,
    UserResponse,
)
from app.repositories import users

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users", response_model=list[DirectoryUserResponse])
def list_directory(_: AuthenticatedUser) -> list[dict]:
    """Active accounts, used to pick board members and card assignees."""
    return users.directory()


@router.patch("/users/me", response_model=UserResponse)
def update_profile(
    payload: UpdateProfileRequest, user: AuthenticatedUser
) -> UserResponse:
    return UserResponse.model_validate(
        users.update_profile(user.id, payload.displayName, payload.email)
    )


@router.post("/users/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest, user: AuthenticatedUser, response: Response
) -> None:
    users.change_password(user.id, payload.currentPassword, payload.newPassword)
    # Changing the password revokes every session, including this one.
    clear_session_cookie(response)


@router.get("/admin/users", response_model=list[UserResponse])
def list_users(_: AdminUser) -> list[dict]:
    return users.list_all()


@router.patch("/admin/users/{user_id}", response_model=UserResponse)
def administer_user(
    user_id: int, payload: AdminUserUpdateRequest, _: AdminUser
) -> UserResponse:
    return UserResponse.model_validate(
        users.administer(
            user_id,
            role=payload.role,
            is_active=payload.isActive,
            display_name=payload.displayName,
        )
    )


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, _: AdminUser) -> None:
    # Sessions, boards, and memberships all cascade from the user row.
    users.delete(user_id)
