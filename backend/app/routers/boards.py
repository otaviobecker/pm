"""Board lifecycle, membership, and column management."""

from fastapi import APIRouter, Query, status

from app.auth import AuthenticatedUser
from app.models import (
    AddBoardMemberRequest,
    BoardResponse,
    BoardSummaryResponse,
    CreateBoardRequest,
    CreateColumnRequest,
    MoveColumnRequest,
    UpdateBoardMemberRequest,
    UpdateBoardRequest,
    UpdateColumnRequest,
)
from app.repositories import boards, columns

router = APIRouter(prefix="/api/boards", tags=["boards"])


@router.get("", response_model=list[BoardSummaryResponse])
def list_boards(
    user: AuthenticatedUser,
    includeArchived: bool = Query(default=False),
) -> list[dict]:
    return boards.list_for_user(user.id, include_archived=includeArchived)


@router.post("", response_model=BoardResponse, status_code=status.HTTP_201_CREATED)
def create_board(payload: CreateBoardRequest, user: AuthenticatedUser) -> dict:
    return boards.create(user.id, payload.name, payload.description)


@router.get("/{board_id}", response_model=BoardResponse)
def read_board(board_id: int, user: AuthenticatedUser) -> dict:
    return boards.get(user.id, board_id)


@router.patch("/{board_id}", response_model=BoardResponse)
def update_board(
    board_id: int, payload: UpdateBoardRequest, user: AuthenticatedUser
) -> dict:
    return boards.update(
        user.id,
        board_id,
        name=payload.name,
        description=payload.description,
        archived=payload.archived,
    )


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(board_id: int, user: AuthenticatedUser) -> None:
    boards.delete(user.id, board_id)


@router.post("/{board_id}/members", response_model=BoardResponse)
def add_member(
    board_id: int, payload: AddBoardMemberRequest, user: AuthenticatedUser
) -> dict:
    return boards.add_member(user.id, board_id, payload.username, payload.role)


@router.patch("/{board_id}/members/{member_id}", response_model=BoardResponse)
def update_member(
    board_id: int,
    member_id: int,
    payload: UpdateBoardMemberRequest,
    user: AuthenticatedUser,
) -> dict:
    return boards.update_member(user.id, board_id, member_id, payload.role)


@router.delete(
    "/{board_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_member(board_id: int, member_id: int, user: AuthenticatedUser) -> None:
    boards.remove_member(user.id, board_id, member_id)


@router.post("/{board_id}/columns", response_model=BoardResponse)
def create_column(
    board_id: int, payload: CreateColumnRequest, user: AuthenticatedUser
) -> dict:
    return columns.create(user.id, board_id, payload.title, payload.wipLimit)


@router.patch("/{board_id}/columns/{column_id}", response_model=BoardResponse)
def update_column(
    board_id: int,
    column_id: str,
    payload: UpdateColumnRequest,
    user: AuthenticatedUser,
) -> dict:
    return columns.update(
        user.id,
        board_id,
        column_id,
        title=payload.title,
        wip_limit=payload.wipLimit,
        clear_wip_limit="wipLimit" in payload.model_fields_set
        and payload.wipLimit is None,
    )


@router.post("/{board_id}/columns/{column_id}/move", response_model=BoardResponse)
def move_column(
    board_id: int,
    column_id: str,
    payload: MoveColumnRequest,
    user: AuthenticatedUser,
) -> dict:
    return columns.move(user.id, board_id, column_id, payload.position)


@router.delete("/{board_id}/columns/{column_id}", response_model=BoardResponse)
def delete_column(
    board_id: int,
    column_id: str,
    user: AuthenticatedUser,
    moveCardsTo: str | None = Query(default=None),
) -> dict:
    return columns.delete(user.id, board_id, column_id, move_cards_to=moveCardsTo)
