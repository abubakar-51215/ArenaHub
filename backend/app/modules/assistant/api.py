"""POST /assistant/ask: the ArenaHub assistant (signed-in players). Rate limited like the other
/api/v1 routes; nothing about the conversation is stored."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.assistant import service
from app.modules.assistant.schema import AskRequest
from app.modules.user.model import User
from app.shared.auth import get_current_user
from app.shared.response import success

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/ask", summary="Ask the ArenaHub assistant (checked answers and your own data)")
async def ask(
    data: AskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    answer = await service.ask(db, user, data.text, data.suggestion)
    return success(data=answer, message="Answered.")
