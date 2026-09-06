"""Card creation, editing, movement, and deletion."""

from fastapi import APIRouter

from app.auth import AuthenticatedUser
from app.models import (
    BoardResponse,
    CreateCardRequest,
    MoveCardRequest,
    UpdateCardRequest,
)
from app.repositories import cards

router = APIRouter(prefix="/api/boards/{board_id}/cards", tags=["cards"])


@router.post("", response_model=BoardResponse)
def create_card(
    board_id: int, payload: CreateCardRequest, user: AuthenticatedUser
) -> dict:
    return cards.create(
        user.id,
        board_id,
        payload.columnId,
        payload.title,
        payload.details,
        priority=payload.priority,
        due_date=payload.dueDate.isoformat() if payload.dueDate else None,
        assignee_id=payload.assigneeId,
        label_ids=payload.labelIds,
    )


@router.patch("/{card_id}", response_model=BoardResponse)
def update_card(
    board_id: int, card_id: str, payload: UpdateCardRequest, user: AuthenticatedUser
) -> dict:
    changes = payload.model_dump(mode="json", exclude_unset=True)
    return cards.update(user.id, board_id, card_id, changes)


@router.post("/{card_id}/move", response_model=BoardResponse)
def move_card(
    board_id: int, card_id: str, payload: MoveCardRequest, user: AuthenticatedUser
) -> dict:
    return cards.move(user.id, board_id, card_id, payload.columnId, payload.position)


@router.delete("/{card_id}", response_model=BoardResponse)
def delete_card(board_id: int, card_id: str, user: AuthenticatedUser) -> dict:
    return cards.delete(user.id, board_id, card_id)
