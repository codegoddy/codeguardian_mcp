import asyncio
import os
import sys
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import select

from app.api.git_integration import github_webhook
from app.db.database import get_db
from app.models.client import Client
from app.models.deliverable import Deliverable
from app.models.git_commit import GitCommit
from app.models.git_integration import GitIntegration
from app.models.git_repository import GitRepository
from app.models.integrations import TimeTrackerIntegration
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.time_session import TimeSession
from app.models.user import User


async def run_simulation():
    print("Starting webhook simulation...")

    # Setup test data
    test_id = str(uuid.uuid4())
    user_email = f"test_{test_id}@example.com"
    project_name = f"Test Project {test_id}"
    repo_name = f"test-user/repo-{test_id}"
    tracking_code = "TEST-001"

    async for db in get_db():
        try:
            # 1. Create User
            print("Creating test user...")
            user = User(email=user_email, full_name="Test User", hashed_password="hash")
            db.add(user)
            await db.flush()

            # 2. Create Client
            print("Creating test client...")
            client = Client(
                user_id=user.id,
                name="Test Client",
                email=f"client_{test_id}@example.com",
                default_hourly_rate=100.0,
                change_request_rate=150.0,
                payment_method="manual",
            )
            db.add(client)
            await db.flush()

            # 3. Create Project
            print("Creating test project...")
            project = Project(
                user_id=user.id,
                client_id=client.id,
                name=project_name,
                project_prefix="TEST",
                description="Test Project",
            )
            db.add(project)
            await db.flush()

            # 4. Create Git Integration
            print("Creating test git integration...")
            git_integration = GitIntegration(
                user_id=user.id,
                platform="github",
                access_token="encrypted_token",
                is_active=True,
            )
            db.add(git_integration)
            await db.flush()

            # 5. Create Git Repository
            print("Creating test git repository...")
            git_repo = GitRepository(
                project_id=project.id,
                integration_id=git_integration.id,
                repo_name=repo_name.split("/")[1],
                repo_full_name=repo_name,
                repo_url=f"https://github.com/{repo_name}",
                is_active=True,
            )
            db.add(git_repo)
            await db.flush()

            # 5. Create Deliverable
            print("Creating test deliverable...")
            deliverable = Deliverable(
                project_id=project.id,
                title="Test Deliverable",
                tracking_code=tracking_code,
                status="in_progress",
            )
            db.add(deliverable)
            await db.commit()

            print(f"Test data created. Repo: {repo_name}, Tracking Code: {tracking_code}")

            # 6. Simulate Webhook
            print("Simulating webhook...")
            commit_sha = "a1b2c3d4e5f67890"
            payload = {
                "repository": {"full_name": repo_name},
                "ref": "refs/heads/main",
                "pusher": {"name": "Test User", "email": user_email},
                "commits": [
                    {
                        "id": commit_sha,
                        "message": f"{tracking_code}: Implemented feature",
                        "timestamp": datetime.utcnow().isoformat(),
                        "url": f"https://github.com/{repo_name}/commit/{commit_sha}",
                        "author": {"name": "Test User", "email": user_email},
                        "added": ["file1.py"],
                        "modified": ["file2.py"],
                        "removed": [],
                    }
                ],
            }

            # Mock Request
            mock_request = AsyncMock()
            mock_request.json.return_value = payload
            mock_request.headers.get.return_value = "push"
            mock_request.body.return_value = b"{}"

            # Call webhook handler
            # We need to patch publish_event to avoid NATS errors and verify calls
            with patch("app.api.git_integration.publish_event", new_callable=AsyncMock) as mock_publish:
                response = await github_webhook(mock_request, db=db)
                print(f"Webhook response: {response}")

                # Verify publish_event was called
                if mock_publish.called:
                    print("Event published successfully.")
                    print(f"Call args: {mock_publish.call_args}")
                else:
                    print("WARNING: Event was NOT published.")

            # 7. Verify DB
            print("Verifying database...")
            stmt = select(GitCommit).where(GitCommit.commit_sha == commit_sha)
            result = await db.execute(stmt)
            commit = result.scalar_one_or_none()

            if commit:
                print(f"SUCCESS: Commit found in DB!")
                print(f"  SHA: {commit.commit_sha}")
                print(f"  Message: {commit.message}")
                print(f"  Deliverable ID: {commit.deliverable_id}")

                if str(commit.deliverable_id) == str(deliverable.id):
                    print("  SUCCESS: Linked to correct deliverable!")
                else:
                    print(f"  FAILURE: Linked to wrong deliverable! Expected {deliverable.id}, got {commit.deliverable_id}")
            else:
                print("FAILURE: Commit NOT found in DB!")

        except Exception as e:
            print(f"Error during simulation: {e}")
            import traceback

            traceback.print_exc()
        finally:
            # Cleanup
            print("Cleaning up test data...")
            try:
                # Refresh user to ensure it's attached to session
                # But we might have committed, so it's detached?
                # Let's just query it again to be sure
                stmt = select(User).where(User.id == user.id)
                result = await db.execute(stmt)
                user_to_delete = result.scalar_one_or_none()

                if user_to_delete:
                    await db.delete(user_to_delete)
                    await db.commit()
                    print("Cleanup complete.")
                else:
                    print("User not found for cleanup (maybe transaction rolled back?)")
            except Exception as e:
                print(f"Error during cleanup: {e}")


if __name__ == "__main__":
    asyncio.run(run_simulation())
