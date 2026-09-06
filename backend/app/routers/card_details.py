"""Board labels, and the comments, checklist, and labels on one card."""

from fastapi import APIRouter

from app.auth import AuthenticatedUser
from app.models import (
    BoardResponse,
    CardDetailResponse,
    CardWorkspaceResponse,
    CommentRequest,
    CreateChecklistItemRequest,
    CreateLabelRequest,
    MoveChecklistItemRequest,
    SetCardLabelsRequest,
    UpdateChecklistItemRequest,
    UpdateLabelRequest,
)
from app.repositories import card_details, labels

router = APIRouter(prefix="/api/boards/{board_id}", tags=["card details"])


@router.post("/labels", response_model=BoardResponse)
def create_label(
    board_id: int, payload: CreateLabelRequest, user: AuthenticatedUser
) -> dict:
    return labels.create(user.id, board_id, payload.name, payload.color)


@router.patch("/labels/{label_id}", response_model=BoardResponse)
def update_label(
    board_id: int,
    label_id: str,
    payload: UpdateLabelRequest,
    user: AuthenticatedUser,
) -> dict:
    return labels.update(
        user.id, board_id, label_id, name=payload.name, color=payload.color
    )


@router.delete("/labels/{label_id}", response_model=BoardResponse)
def delete_label(board_id: int, label_id: str, user: AuthenticatedUser) -> dict:
    return labels.delete(user.id, board_id, label_id)


@router.get("/cards/{card_id}", response_model=CardDetailResponse)
def read_card(board_id: int, card_id: str, user: AuthenticatedUser) -> dict:
    return card_details.get(user.id, board_id, card_id)


@router.put("/cards/{card_id}/labels", response_model=CardWorkspaceResponse)
def set_card_labels(
    board_id: int,
    card_id: str,
    payload: SetCardLabelsRequest,
    user: AuthenticatedUser,
) -> dict:
    return card_details.set_labels(user.id, board_id, card_id, payload.labelIds)


@router.post("/cards/{card_id}/comments", response_model=CardWorkspaceResponse)
def add_comment(
    board_id: int, card_id: str, payload: CommentRequest, user: AuthenticatedUser
) -> dict:
    return card_details.add_comment(user.id, board_id, card_id, payload.body)


@router.patch(
    "/cards/{card_id}/comments/{comment_id}", response_model=CardWorkspaceResponse
)
def edit_comment(
    board_id: int,
    card_id: str,
    comment_id: int,
    payload: CommentRequest,
    user: AuthenticatedUser,
) -> dict:
    return card_details.edit_comment(
        user.id, board_id, card_id, comment_id, payload.body
    )


@router.delete(
    "/cards/{card_id}/comments/{comment_id}", response_model=CardWorkspaceResponse
)
def delete_comment(
    board_id: int, card_id: str, comment_id: int, user: AuthenticatedUser
) -> dict:
    return card_details.delete_comment(user.id, board_id, card_id, comment_id)


@router.post("/cards/{card_id}/checklist", response_model=CardWorkspaceResponse)
def add_checklist_item(
    board_id: int,
    card_id: str,
    payload: CreateChecklistItemRequest,
    user: AuthenticatedUser,
) -> dict:
    return card_details.add_checklist_item(user.id, board_id, card_id, payload.title)


@router.patch(
    "/cards/{card_id}/checklist/{item_id}", response_model=CardWorkspaceResponse
)
def update_checklist_item(
    board_id: int,
    card_id: str,
    item_id: int,
    payload: UpdateChecklistItemRequest,
    user: AuthenticatedUser,
) -> dict:
    return card_details.update_checklist_item(
        user.id, board_id, card_id, item_id, title=payload.title, done=payload.done
    )


@router.post(
    "/cards/{card_id}/checklist/{item_id}/move", response_model=CardWorkspaceResponse
)
def move_checklist_item(
    board_id: int,
    card_id: str,
    item_id: int,
    payload: MoveChecklistItemRequest,
    user: AuthenticatedUser,
) -> dict:
    return card_details.move_checklist_item(
        user.id, board_id, card_id, item_id, payload.position
    )


@router.delete(
    "/cards/{card_id}/checklist/{item_id}", response_model=CardWorkspaceResponse
)
def delete_checklist_item(
    board_id: int, card_id: str, item_id: int, user: AuthenticatedUser
) -> dict:
    return card_details.delete_checklist_item(user.id, board_id, card_id, item_id)
