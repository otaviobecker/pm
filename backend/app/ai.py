import json
import os
from typing import Any

import httpx2

from app.models import BoardResponse, ChatMessage, StructuredAiResponse

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"


class AiError(Exception):
    pass


class AiConfigurationError(AiError):
    pass


class AiServiceError(AiError):
    pass


class AiResponseError(AiError):
    pass


def post_openrouter(payload: dict[str, Any]) -> dict[str, Any]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise AiConfigurationError("OPENROUTER_API_KEY is not configured")

    try:
        with httpx2.Client(timeout=60) as client:
            response = client.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "X-Title": "Project Management MVP",
                },
                json=payload,
            )
            response.raise_for_status()
            return response.json()
    except httpx2.TimeoutException as exception:
        raise AiServiceError("OpenRouter request timed out") from exception
    except httpx2.HTTPStatusError as exception:
        raise AiServiceError(
            f"OpenRouter returned status {exception.response.status_code}"
        ) from exception
    except httpx2.RequestError as exception:
        raise AiServiceError("Unable to reach OpenRouter") from exception


def response_content(response: dict[str, Any]) -> str:
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exception:
        raise AiResponseError("OpenRouter response did not contain a message") from exception
    if not isinstance(content, str) or not content.strip():
        raise AiResponseError("OpenRouter returned an empty message")
    return content


def test_connectivity() -> str:
    response = post_openrouter(
        {
            "model": MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": "What is 2+2? Reply with only the number.",
                }
            ],
        }
    )
    return response_content(response)


def board_snapshot(board: BoardResponse) -> dict[str, Any]:
    """The board as the assistant sees it: no members, timestamps, or IDs it cannot use."""
    return {
        "name": board.name,
        "description": board.description,
        "columns": [
            {
                "id": column.id,
                "title": column.title,
                "wipLimit": column.wipLimit,
                "cards": [
                    {
                        "id": card_id,
                        "title": board.cards[card_id].title,
                        "details": board.cards[card_id].details,
                        "priority": board.cards[card_id].priority,
                        "dueDate": board.cards[card_id].dueDate,
                    }
                    for card_id in column.cardIds
                ],
            }
            for column in board.columns
        ],
    }


def system_prompt(board: BoardResponse) -> str:
    column_ids = ", ".join(column.id for column in board.columns)
    return (
        "You are a project management assistant working on a Kanban board. Respond using "
        "the required JSON schema. Set board to null for conversation-only answers. When "
        "changing the board, return the complete board. Preserve exactly these column IDs "
        f"and order: {column_ids}. You may rename columns and create, edit, delete, "
        "reorder, or move cards, and you may set each card's priority (low, medium, high, "
        "urgent) and dueDate (YYYY-MM-DD or null). Return cards nested in their target "
        "column in display order, and include every card exactly once. Keep the ID of an "
        "existing card unchanged and invent a new short ID for a card you add."
    )


def chat(
    board: BoardResponse,
    message: str,
    history: list[ChatMessage],
) -> StructuredAiResponse:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt(board)}
    ]
    messages.extend({"role": item.role, "content": item.content} for item in history)
    messages.append(
        {
            "role": "user",
            "content": (
                f"Current board:\n{json.dumps(board_snapshot(board))}\n\n"
                f"User request:\n{message}"
            ),
        }
    )
    response = post_openrouter(
        {
            "model": MODEL,
            "messages": messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "kanban_assistant_response",
                    "strict": True,
                    "schema": StructuredAiResponse.model_json_schema(),
                },
            },
        }
    )
    try:
        return StructuredAiResponse.model_validate_json(response_content(response))
    except ValueError as exception:
        raise AiResponseError("OpenRouter returned invalid structured output") from exception
