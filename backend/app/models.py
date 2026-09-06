"""Pydantic models shared by the API routes and the AI structured-output schema."""

import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$")

Priority = Literal["low", "medium", "high", "urgent"]
BoardRole = Literal["owner", "editor", "viewer"]
GrantableRole = Literal["editor", "viewer"]
AccountRole = Literal["admin", "member"]


def _require_nonblank(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("must not be blank")
    return stripped


def _require_username(value: str) -> str:
    stripped = value.strip()
    if not USERNAME_PATTERN.fullmatch(stripped):
        raise ValueError(
            "must be 3-32 characters using letters, digits, dot, dash, or underscore, "
            "and start with a letter or digit"
        )
    return stripped


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    displayName: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=254)

    _validate_username = field_validator("username")(_require_username)


class UserResponse(BaseModel):
    id: int
    username: str
    displayName: str
    email: str
    role: AccountRole
    isActive: bool
    createdAt: str
    updatedAt: str


class DirectoryUserResponse(BaseModel):
    id: int
    username: str
    displayName: str


class UpdateProfileRequest(BaseModel):
    displayName: str = Field(min_length=1, max_length=80)
    email: str = Field(default="", max_length=254)

    _validate_display_name = field_validator("displayName")(_require_nonblank)


class ChangePasswordRequest(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=128)
    newPassword: str = Field(min_length=8, max_length=128)


class AdminUserUpdateRequest(BaseModel):
    role: AccountRole | None = None
    isActive: bool | None = None
    displayName: str | None = Field(default=None, min_length=1, max_length=80)


class CardResponse(BaseModel):
    id: str
    title: str
    details: str
    priority: Priority
    dueDate: str | None = None
    assigneeId: int | None = None
    createdAt: str
    updatedAt: str


class ColumnResponse(BaseModel):
    id: str
    title: str
    wipLimit: int | None = None
    cardIds: list[str]


class BoardMemberResponse(BaseModel):
    userId: int
    username: str
    displayName: str
    role: BoardRole


class BoardResponse(BaseModel):
    id: int
    name: str
    description: str
    archived: bool
    ownerId: int
    role: BoardRole
    createdAt: str
    updatedAt: str
    columns: list[ColumnResponse]
    cards: dict[str, CardResponse]
    members: list[BoardMemberResponse]


class BoardSummaryResponse(BaseModel):
    id: int
    name: str
    description: str
    archived: bool
    ownerId: int
    ownerUsername: str
    ownerDisplayName: str
    role: BoardRole
    cardCount: int
    memberCount: int
    createdAt: str
    updatedAt: str


class CreateBoardRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)

    _validate_name = field_validator("name")(_require_nonblank)


class UpdateBoardRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    archived: bool | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        return None if value is None else _require_nonblank(value)


class AddBoardMemberRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    role: GrantableRole = "editor"


class UpdateBoardMemberRequest(BaseModel):
    role: GrantableRole


class CreateColumnRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    wipLimit: int | None = Field(default=None, ge=1, le=999)

    _validate_title = field_validator("title")(_require_nonblank)


class UpdateColumnRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    wipLimit: int | None = Field(default=None, ge=1, le=999)

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str | None) -> str | None:
        return None if value is None else _require_nonblank(value)


class MoveColumnRequest(BaseModel):
    position: int = Field(ge=0)


class CreateCardRequest(BaseModel):
    columnId: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)
    priority: Priority = "medium"
    dueDate: date | None = None
    assigneeId: int | None = None

    _validate_title = field_validator("title")(_require_nonblank)


class UpdateCardRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    details: str | None = Field(default=None, max_length=5000)
    priority: Priority | None = None
    dueDate: date | None = None
    assigneeId: int | None = None

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str | None) -> str | None:
        return None if value is None else _require_nonblank(value)


class MoveCardRequest(BaseModel):
    columnId: str = Field(min_length=1, max_length=64)
    position: int = Field(ge=0)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=10000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=50)


class AiCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)
    priority: Priority = "medium"
    dueDate: str | None = None

    _validate_title = field_validator("title")(_require_nonblank)

    @field_validator("dueDate")
    @classmethod
    def _validate_due_date(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return date.fromisoformat(value.strip()).isoformat()


class AiColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str = Field(min_length=1, max_length=100)
    cards: list[AiCard]

    _validate_title = field_validator("title")(_require_nonblank)


class AiBoard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[AiColumn]


class StructuredAiResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1)
    board: AiBoard | None = None


class ChatResponse(BaseModel):
    message: str
    board: BoardResponse | None = None
