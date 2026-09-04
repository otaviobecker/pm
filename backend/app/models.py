from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    username: str


class CardResponse(BaseModel):
    id: str
    title: str
    details: str


class ColumnResponse(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardResponse(BaseModel):
    columns: list[ColumnResponse]
    cards: dict[str, CardResponse]


class RenameColumnRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)


class CardRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)


class CreateCardRequest(CardRequest):
    columnId: str


class MoveCardRequest(BaseModel):
    columnId: str
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
    title: str
    details: str


class AiColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    cards: list[AiCard]


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
