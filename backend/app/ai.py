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


def chat(
    board: BoardResponse,
    message: str,
    history: list[ChatMessage],
) -> StructuredAiResponse:
    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": (
                "You are a project management assistant. Respond using the required JSON schema. "
                "Set board to null for conversation-only answers. When changing the board, return "
                "the complete board. Preserve exactly these column IDs and order: col-backlog, "
                "col-discovery, col-progress, col-review, col-done. You may rename columns and "
                "create, edit, delete, reorder, or move cards. Return cards nested in their target "
                "column in display order, and include every card exactly once."
            ),
        }
    ]
    messages.extend(
        {"role": item.role, "content": item.content}
        for item in history
    )
    messages.append(
        {
            "role": "user",
            "content": (
                f"Current board:\n{board.model_dump_json(by_alias=True)}\n\n"
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
