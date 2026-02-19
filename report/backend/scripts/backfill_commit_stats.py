"""
Backfill commit statistics (insertions/deletions) for existing commits.

This script fetches detailed commit information from GitHub API for commits
that currently have 0 insertions and 0 deletions.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import decrypt_token
from app.models.git_commit import GitCommit
from app.models.git_integration import GitIntegration
from app.models.git_repository import GitRepository
from app.utils.git_providers import GitHubClient


async def backfill_commit_stats():
    """Backfill commit statistics for existing commits."""

    # Create async engine and session
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        # Find all commits with 0 insertions and 0 deletions
        result = await db.execute(
            select(GitCommit)
            .where(GitCommit.insertions == 0, GitCommit.deletions == 0)
            .order_by(GitCommit.committed_at.desc())
        )
        commits = result.scalars().all()

        print(f"Found {len(commits)} commits with missing stats")

        updated_count = 0
        failed_count = 0

        for commit in commits:
            try:
                # Get repository
                repo_result = await db.execute(select(GitRepository).where(GitRepository.id == commit.repository_id))
                repo = repo_result.scalar_one_or_none()

                if not repo:
                    print(f"❌ Repository not found for commit {commit.commit_sha[:8]}")
                    failed_count += 1
                    continue

                # Get integration
                integration_result = await db.execute(select(GitIntegration).where(GitIntegration.id == repo.integration_id))
                integration = integration_result.scalar_one_or_none()

                if not integration:
                    print(f"❌ Integration not found for repo {repo.repo_name}")
                    failed_count += 1
                    continue

                # Fetch commit details from GitHub
                access_token = decrypt_token(integration.access_token)
                github_client = GitHubClient(access_token)

                commit_details = await github_client.get_commit_details(repo.repo_full_name, commit.commit_sha)

                if commit_details:
                    insertions = commit_details.get("stats", {}).get("additions", 0)
                    deletions = commit_details.get("stats", {}).get("deletions", 0)

                    # Update commit
                    commit.insertions = insertions
                    commit.deletions = deletions

                    print(f"✅ Updated {commit.commit_sha[:8]}: +{insertions} -{deletions}")
                    updated_count += 1
                else:
                    print(f"❌ Failed to fetch details for {commit.commit_sha[:8]}")
                    failed_count += 1

                # Commit every 10 updates to avoid losing progress
                if updated_count % 10 == 0:
                    await db.commit()
                    print(f"💾 Saved progress ({updated_count} commits updated)")

            except Exception as e:
                print(f"❌ Error processing commit {commit.commit_sha[:8]}: {e}")
                failed_count += 1
                continue

        # Final commit
        await db.commit()

        print("\n" + "=" * 50)
        print(f"✅ Successfully updated: {updated_count} commits")
        print(f"❌ Failed: {failed_count} commits")
        print("=" * 50)


if __name__ == "__main__":
    print("Starting commit stats backfill...")
    asyncio.run(backfill_commit_stats())
