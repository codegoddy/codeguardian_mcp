"""
Script to seed system templates into the database.
This ensures system templates have stable UUIDs that can be referenced.
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.db.database import get_async_session
from app.models.project_template import ProjectTemplate
from app.utils.seed_templates import get_system_templates

logger = get_logger(__name__)


async def seed_system_templates():
    """
    Seed system templates into the database.
    Updates existing templates if they already exist (based on name).
    """
    session_maker = get_async_session()
    async with session_maker() as db:
        try:
            system_templates = get_system_templates()

            seeded_count = 0
            updated_count = 0

            for template_data in system_templates:
                # Check if template already exists by name
                result = await db.execute(
                    select(ProjectTemplate).where(
                        ProjectTemplate.name == template_data["name"],
                        ProjectTemplate.is_system_template == True,
                    )
                )
                existing_template = result.scalar_one_or_none()

                if existing_template:
                    # Update existing template
                    existing_template.description = template_data["description"]
                    existing_template.category = template_data.get("category")
                    existing_template.template_type = template_data.get("template_type", "code")
                    existing_template.template_data = template_data["template_data"]
                    updated_count += 1
                    logger.info("Updated: %s", template_data["name"])
                else:
                    # Create new template
                    new_template = ProjectTemplate(
                        user_id=None,  # System templates have no user_id
                        name=template_data["name"],
                        description=template_data["description"],
                        category=template_data.get("category"),
                        template_type=template_data.get("template_type", "code"),
                        template_data=template_data["template_data"],
                        is_system_template=True,
                        is_public=False,  # System templates are accessible to all users via code logic
                        usage_count=0,
                    )
                    db.add(new_template)
                    seeded_count += 1
                    logger.info("Created: %s", template_data["name"])

            await db.commit()

            logger.info("Seeding complete!")
            logger.info("Created: %d templates", seeded_count)
            logger.info("Updated: %d templates", updated_count)
            logger.info("Total: %d templates", seeded_count + updated_count)

        except Exception as e:
            await db.rollback()
            logger.error("Error seeding templates: %s", e, exc_info=True)
            raise


async def main():
    """Main entry point for the seed script"""
    logger.info("Seeding system templates...")
    await seed_system_templates()


if __name__ == "__main__":
    asyncio.run(main())
