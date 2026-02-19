import asyncio

from sqlalchemy import func, select

from app.db.database import get_async_session
from app.models.project_template import ProjectTemplate


async def verify_templates():
    session_maker = get_async_session()
    async with session_maker() as db:
        result = await db.execute(
            select(func.count()).select_from(ProjectTemplate).where(ProjectTemplate.is_system_template == True)
        )
        count = result.scalar()
        print(f"Total system templates in DB: {count}")

        # Also print the names to be sure
        result = await db.execute(select(ProjectTemplate.name).where(ProjectTemplate.is_system_template == True))
        names = result.scalars().all()
        for name in names:
            print(f"- {name}")


if __name__ == "__main__":
    asyncio.run(verify_templates())
