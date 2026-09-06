"""What one person owes across every board they can open."""

from contextlib import closing
from typing import Any

from app.database import connect
from app.repositories import boards

ASSIGNED_QUERY = f"""
    SELECT {boards.CARD_COLUMNS},
           boards.id AS board_id, boards.name AS board_name,
           columns.title AS column_title
    FROM cards
    JOIN boards ON boards.id = cards.board_id
    JOIN columns ON columns.board_id = cards.board_id AND columns.id = cards.column_id
    JOIN board_members ON board_members.board_id = cards.board_id
                      AND board_members.user_id = ?
    WHERE cards.assignee_id = ? AND boards.archived = 0
    ORDER BY cards.due_date IS NULL, cards.due_date, lower(boards.name), cards.position
"""


def assigned_to(user_id: int) -> list[dict[str, Any]]:
    """Cards assigned to the user, soonest due first and undated last.

    Archived boards are left out, and membership is joined rather than assumed, so
    losing access to a board also removes its cards from this list.
    """
    with closing(connect()) as connection:
        rows = connection.execute(ASSIGNED_QUERY, (user_id, user_id)).fetchall()
        labels_by_board: dict[int, dict[str, list[str]]] = {}
        assigned = []
        for row in rows:
            board_id = row["board_id"]
            if board_id not in labels_by_board:
                labels_by_board[board_id] = boards.read_card_labels(connection, board_id)
            card = boards.serialize_card(
                row, labels_by_board[board_id].get(row["id"], [])
            )
            card["boardId"] = board_id
            card["boardName"] = row["board_name"]
            card["columnTitle"] = row["column_title"]
            assigned.append(card)
    return assigned
