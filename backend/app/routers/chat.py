"""The AI assistant: connectivity check and board-scoped chat."""

from fastapi import APIRouter

from app import ai
from app.auth import AuthenticatedUser
from app.models import BoardResponse, ChatRequest, ChatResponse
from app.repositories import board_updates, boards

router = APIRouter(prefix="/api", tags=["ai"])


@router.post("/ai/test")
def test_ai_connection(_: AuthenticatedUser) -> dict[str, str]:
    return {"message": ai.test_connectivity()}


@router.post("/boards/{board_id}/chat", response_model=ChatResponse)
def chat(board_id: int, request: ChatRequest, user: AuthenticatedUser) -> ChatResponse:
    board = BoardResponse.model_validate(boards.get(user.id, board_id))
    result = ai.chat(board, request.message, request.history)
    if result.board is None:
        return ChatResponse(message=result.message, board=None)

    proposal = {
        "columns": [
            {
                "id": column.id,
                "title": column.title,
                "cardIds": [card.id for card in column.cards],
            }
            for column in result.board.columns
        ],
        "cards": {
            card.id: card.model_dump()
            for column in result.board.columns
            for card in column.cards
        },
    }
    updated = board_updates.replace(user.id, board_id, proposal)
    return ChatResponse(
        message=result.message, board=BoardResponse.model_validate(updated)
    )
