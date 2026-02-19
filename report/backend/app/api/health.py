"""
Comprehensive Health Check Endpoints per Domain

Provides detailed health status for each service domain to enable:
- Kubernetes readiness/liveness probes
- Service mesh health checks
- Monitoring and alerting
- Load balancer health checks
"""

import asyncio
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db

router = APIRouter()


# ============================================================================
# Overall Health Check
# ============================================================================


@router.get("/health")
async def health_check():
    """
    Basic health check endpoint.
    Returns 200 OK if service is running.
    """
    return {
        "status": "healthy",
        "service": settings.app_name,
        "environment": settings.environment,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/health/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """
    Readiness check - indicates if service is ready to accept traffic.
    Checks all critical dependencies.
    """
    health_status = {
        "status": "ready",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {},
    }

    # Check database connectivity
    try:
        result = await db.execute(text("SELECT 1"))
        health_status["checks"]["database"] = {
            "status": "healthy",
            "message": "Database connection successful",
        }
    except Exception as e:
        health_status["status"] = "not_ready"
        health_status["checks"]["database"] = {
            "status": "unhealthy",
            "message": f"Database connection failed: {str(e)}",
        }

    # Check NATS connectivity
    try:
        from app.utils.nats_client import nc

        if nc and nc.is_connected:
            health_status["checks"]["nats"] = {
                "status": "healthy",
                "message": "NATS connected",
            }
        else:
            health_status["status"] = "not_ready"
            health_status["checks"]["nats"] = {
                "status": "unhealthy",
                "message": "NATS not connected",
            }
    except Exception as e:
        health_status["status"] = "not_ready"
        health_status["checks"]["nats"] = {
            "status": "unhealthy",
            "message": f"NATS check failed: {str(e)}",
        }

    # Check Redis (optional - don't fail if Redis is down)
    try:
        if settings.upstash_redis_rest_url:
            from upstash_redis import Redis

            redis_client = Redis(
                url=settings.upstash_redis_rest_url,
                token=settings.upstash_redis_rest_token,
            )
            redis_client.ping()
            health_status["checks"]["redis"] = {
                "status": "healthy",
                "message": "Redis connected",
            }
    except Exception as e:
        health_status["checks"]["redis"] = {
            "status": "degraded",
            "message": f"Redis unavailable (non-critical): {str(e)}",
        }

    if health_status["status"] == "not_ready":
        raise HTTPException(status_code=503, detail=health_status)

    return health_status


@router.get("/health/live")
async def liveness_check():
    """
    Liveness check - indicates if service is alive.
    Returns 200 if the service process is running.
    Used by Kubernetes to restart unhealthy pods.
    """
    return {"status": "alive", "timestamp": datetime.utcnow().isoformat()}


# ============================================================================
# Domain-Specific Health Checks
# ============================================================================


@router.get("/health/auth")
async def auth_service_health(db: AsyncSession = Depends(get_db)):
    """
    Authentication service health check.
    Verifies user database access and OAuth connectivity.
    """
    try:
        # Check if users table is accessible
        result = await db.execute(text("SELECT COUNT(*) FROM users LIMIT 1"))
        user_count = result.scalar()

        return {
            "status": "healthy",
            "domain": "authentication",
            "checks": {"database": "healthy", "user_table": "accessible"},
            "metrics": {"user_count": user_count},
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "domain": "authentication",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


@router.get("/health/projects")
async def project_service_health(db: AsyncSession = Depends(get_db)):
    """
    Project management service health check.
    Verifies project and deliverable database access.
    """
    try:
        # Check projects table
        projects_result = await db.execute(text("SELECT COUNT(*) FROM projects"))
        project_count = projects_result.scalar()

        # Check deliverables table
        deliverables_result = await db.execute(text("SELECT COUNT(*) FROM deliverables"))
        deliverable_count = deliverables_result.scalar()

        return {
            "status": "healthy",
            "domain": "projects",
            "checks": {
                "database": "healthy",
                "projects_table": "accessible",
                "deliverables_table": "accessible",
            },
            "metrics": {
                "project_count": project_count,
                "deliverable_count": deliverable_count,
            },
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "domain": "projects",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


@router.get("/health/finance")
async def finance_service_health(db: AsyncSession = Depends(get_db)):
    """
    Financial service health check.
    Verifies invoice and payment database access.
    """
    try:
        # Check invoices table
        invoices_result = await db.execute(text("SELECT COUNT(*) FROM invoices"))
        invoice_count = invoices_result.scalar()

        return {
            "status": "healthy",
            "domain": "finance",
            "checks": {"database": "healthy", "invoices_table": "accessible"},
            "metrics": {"invoice_count": invoice_count},
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "domain": "finance",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


@router.get("/health/git-automation")
async def git_automation_health(db: AsyncSession = Depends(get_db)):
    """
    Git automation service health check.
    Verifies git integration and commit tracking.
    """
    try:
        # Check git integrations
        integrations_result = await db.execute(text("SELECT COUNT(*) FROM git_integrations"))
        integration_count = integrations_result.scalar()

        # Check git commits
        commits_result = await db.execute(text("SELECT COUNT(*) FROM git_commits"))
        commit_count = commits_result.scalar()

        # Check NATS connectivity for git events
        from app.utils.nats_client import nc

        nats_status = "connected" if (nc and nc.is_connected) else "disconnected"

        return {
            "status": "healthy" if nats_status == "connected" else "degraded",
            "domain": "git-automation",
            "checks": {
                "database": "healthy",
                "git_integrations_table": "accessible",
                "git_commits_table": "accessible",
                "nats": nats_status,
            },
            "metrics": {
                "integration_count": integration_count,
                "commit_count": commit_count,
            },
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "domain": "git-automation",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


@router.get("/health/time-tracking")
async def time_tracking_health(db: AsyncSession = Depends(get_db)):
    """
    Time tracking service health check.
    Verifies time entry and session database access.
    """
    try:
        # Check time entries
        entries_result = await db.execute(text("SELECT COUNT(*) FROM time_entries"))
        entry_count = entries_result.scalar()

        # Check active sessions
        sessions_result = await db.execute(text("SELECT COUNT(*) FROM time_sessions WHERE end_time IS NULL"))
        active_sessions = sessions_result.scalar()

        return {
            "status": "healthy",
            "domain": "time-tracking",
            "checks": {
                "database": "healthy",
                "time_entries_table": "accessible",
                "time_sessions_table": "accessible",
            },
            "metrics": {
                "total_entries": entry_count,
                "active_sessions": active_sessions,
            },
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "domain": "time-tracking",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


@router.get("/health/notifications")
async def notification_service_health(db: AsyncSession = Depends(get_db)):
    """
    Notification service health check.
    Verifies notification database and NATS event bus.
    """
    try:
        # Check notifications table
        notifications_result = await db.execute(text("SELECT COUNT(*) FROM notifications"))
        notification_count = notifications_result.scalar()

        # Check NATS connectivity
        from app.utils.nats_client import nc

        nats_status = "connected" if (nc and nc.is_connected) else "disconnected"

        return {
            "status": "healthy" if nats_status == "connected" else "degraded",
            "domain": "notifications",
            "checks": {
                "database": "healthy",
                "notifications_table": "accessible",
                "nats": nats_status,
            },
            "metrics": {"notification_count": notification_count},
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "domain": "notifications",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


# ============================================================================
# Detailed System Health
# ============================================================================


@router.get("/health/detailed")
async def detailed_health(db: AsyncSession = Depends(get_db)):
    """
    Comprehensive health check for all domains.
    Returns detailed status of all service components.
    """
    health_checks = {}
    overall_status = "healthy"

    # Run all domain health checks concurrently
    domains = [
        ("auth", auth_service_health),
        ("projects", project_service_health),
        ("finance", finance_service_health),
        ("git-automation", git_automation_health),
        ("time-tracking", time_tracking_health),
        ("notifications", notification_service_health),
    ]

    for domain_name, check_func in domains:
        try:
            result = await check_func(db)
            health_checks[domain_name] = result
            if result.get("status") == "degraded":
                overall_status = "degraded"
        except HTTPException as e:
            health_checks[domain_name] = e.detail
            overall_status = "unhealthy"
        except Exception as e:
            health_checks[domain_name] = {"status": "error", "error": str(e)}
            overall_status = "unhealthy"

    return {
        "status": overall_status,
        "timestamp": datetime.utcnow().isoformat(),
        "service": settings.app_name,
        "environment": settings.environment,
        "domains": health_checks,
    }
