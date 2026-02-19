import asyncio
import os
import sys

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from sqlalchemy import select

from app.db.database import get_db
from app.models.client import Client
from app.models.deliverable import Deliverable
from app.models.git_commit import GitCommit
from app.models.git_integration import GitIntegration
from app.models.git_repository import GitRepository
from app.models.project import Project

# Import all models to avoid registry issues
from app.models.user import User


async def check_db():
    print("Checking database...")
    async for db in get_db():
        project_id = "78eb7270-7dba-4f67-b94c-c3f37e7e83a6"

        # Check Project
        try:
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            if project:
                print(f"Project: {project.name}")
                print(f"Prefix: {project.project_prefix}")
                print(f"Contract Signed: {project.contract_signed}")
            else:
                print("Project not found")
                return

            # Check Deliverables
            result = await db.execute(select(Deliverable).where(Deliverable.project_id == project_id))
            deliverables = result.scalars().all()
            print(f"Found {len(deliverables)} deliverables")
            for d in deliverables:
                print(f"Deliverable: {d.title}")
                print(f"  Tracking Code: {d.tracking_code}")
                print(f"  Status: {d.status}")
        except Exception as e:
            print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(check_db())
