"""
Database query optimization utilities.

This module provides helper functions and decorators for optimizing database queries,
including N+1 query detection and batch query helpers.
"""

from contextlib import contextmanager
from functools import wraps
from typing import Any, Callable, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Load, joinedload, selectinload

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class QueryOptimizer:
    """Helper class for common query optimization patterns"""

    @staticmethod
    def with_common_relationships(model) -> List[Load]:
        """
        Returns eager loading options for commonly accessed relationships.

        Usage:
            stmt = select(Project).options(*QueryOptimizer.with_common_relationships(Project))
        """
        from app.models.client import Client
        from app.models.project import Project

        options_map = {
            "Project": [
                selectinload(Project.deliverables),
                selectinload(Project.payment_milestones),
                joinedload(Project.client),
            ],
            "Client": [
                joinedload(Client.user),
            ],
        }

        # Add Deliverable options if model is available
        try:
            from app.models.deliverable import Deliverable

            options_map["Deliverable"] = [
                selectinload(Deliverable.git_commits),
            ]
        except ImportError:
            pass

        return options_map.get(model.__name__, [])


def log_query_performance(func: Callable) -> Callable:
    """
    Decorator to log query execution time and detect potential N+1 queries.

    Usage:
        @log_query_performance
        async def get_projects(db: AsyncSession, user_id: UUID):
            ...
    """

    @wraps(func)
    async def wrapper(*args, **kwargs):
        import time
        import traceback

        start_time = time.time()

        # Track the number of queries executed
        db_session = None
        for arg in args:
            if isinstance(arg, AsyncSession):
                db_session = arg
                break

        if db_session:
            # Get initial query count (if available)
            initial_count = getattr(db_session, "query_count", 0)

        try:
            result = await func(*args, **kwargs)

            execution_time = time.time() - start_time

            if db_session:
                # Check if query count increased significantly
                final_count = getattr(db_session, "query_count", initial_count)
                queries_executed = final_count - initial_count

                if queries_executed > 10:
                    logger.warning(
                        "Function executed many database queries",
                        extra={
                            "function": func.__name__,
                            "queries_executed": queries_executed,
                            "execution_time": round(execution_time, 3),
                            "call_site": traceback.extract_stack()[-2].filename,
                        },
                    )
                elif execution_time > 1.0:
                    logger.warning(
                        "Function took longer than expected",
                        extra={
                            "function": func.__name__,
                            "execution_time": round(execution_time, 3),
                            "call_site": traceback.extract_stack()[-2].filename,
                        },
                    )

            return result
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(
                "Function failed during execution",
                extra={
                    "function": func.__name__,
                    "execution_time": round(execution_time, 3),
                    "error": str(e),
                },
                exc_info=True,
            )
            raise

    return wrapper


async def batch_load_by_ids(
    db: AsyncSession,
    model_class,
    ids: List[Any],
    eager_loads: Optional[List[Load]] = None,
) -> dict:
    """
    Batch load objects by their IDs to prevent N+1 queries.

    Args:
        db: Database session
        model_class: SQLAlchemy model class
        ids: List of IDs to load
        eager_loads: Optional list of eager loading options

    Returns:
        Dictionary mapping IDs to objects

    Example:
        # Instead of multiple individual queries:
        for client_id in client_ids:
            client = await get_client_by_id(db, client_id)

        # Use batch loading:
        clients = await batch_load_by_ids(db, Client, client_ids)
    """
    if not ids:
        return {}

    stmt = select(model_class).where(model_class.id.in_(ids))

    if eager_loads:
        stmt = stmt.options(*eager_loads)

    result = await db.execute(stmt)
    objects = result.scalars().all()

    return {obj.id: obj for obj in objects}


def check_for_nplus1_warnings(result_count: int, query_count: int, function_name: str) -> None:
    """
    Check if a function might have N+1 query issues.

    Args:
        result_count: Number of results returned
        query_count: Number of queries executed
        function_name: Name of the function being checked

    This logs a warning if query count is significantly higher than result count,
    which is a classic N+1 query pattern.
    """
    if query_count > result_count * 2:
        logger.warning(
            "Potential N+1 query detected",
            extra={
                "function": function_name,
                "result_count": result_count,
                "query_count": query_count,
                "ratio": round(query_count / max(result_count, 1), 2),
            },
        )


class EagerLoader:
    """Context manager for tracking eager loading suggestions"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.query_count_before = 0

    async def __aenter__(self):
        # Track initial query count if available
        self.query_count_before = getattr(self.db, "query_count", 0)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        query_count_after = getattr(self.db, "query_count", 0)
        queries_executed = query_count_after - self.query_count_before

        if queries_executed > 5:
            logger.warning(
                "Many queries executed in context",
                extra={
                    "queries_executed": queries_executed,
                    "suggestion": "Consider using selectinload() or joinedload() for relationships",
                },
            )


# Common batch query helpers


async def batch_get_project_with_client(db: AsyncSession, project_ids: List[Any]) -> dict:
    """Batch load projects with their clients"""
    from app.models.project import Project

    stmt = select(Project).options(joinedload(Project.client)).where(Project.id.in_(project_ids))

    result = await db.execute(stmt)
    projects = result.unique().scalars().all()

    return {p.id: p for p in projects}


async def batch_get_deliverables_with_commits(db: AsyncSession, deliverable_ids: List[Any]) -> dict:
    """Batch load deliverables with their git commits"""
    from app.models.deliverable import Deliverable

    stmt = select(Deliverable).options(selectinload(Deliverable.git_commits)).where(Deliverable.id.in_(deliverable_ids))

    result = await db.execute(stmt)
    deliverables = result.scalars().all()

    return {d.id: d for d in deliverables}


async def batch_get_user_data(db: AsyncSession, user_ids: List[Any]) -> dict:
    """Batch load users with their settings"""
    from app.models.user import User

    stmt = select(User).options(joinedload(User.settings)).where(User.id.in_(user_ids))

    result = await db.execute(stmt)
    users = result.unique().scalars().all()

    return {u.id: u for u in users}
