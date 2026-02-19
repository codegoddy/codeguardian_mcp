"""Dashboard bundle API endpoint"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.change_request import ChangeRequest
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.project import Project
from app.models.time_tracking import TimeEntry
from app.models.user import User, UserSettings

logger = get_logger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardBundleResponse(BaseModel):
    """Schema for dashboard bundle response"""

    projects: List[Dict[str, Any]]
    clients: List[Dict[str, Any]]
    change_requests: List[Dict[str, Any]]
    invoices_summary: Dict[str, Any]
    time_summary: Dict[str, Any]
    recent_invoices: List[Dict[str, Any]]
    stats: Dict[str, int]


@router.get("/bundle", response_model=DashboardBundleResponse)
async def get_dashboard_bundle(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get all dashboard data in one response.
    Returns projects, clients, change requests, invoices, time entries, and payments.
    """
    import traceback

    try:
        logger.info(f"Dashboard bundle requested for user: {current_user.id}")

        # Validate user has ID
        if not current_user or not current_user.id:
            logger.error("Dashboard bundle called with invalid user")
            raise HTTPException(status_code=401, detail="Invalid authentication")

        # ========== Get Projects ==========
        # Note: Project model doesn't have is_active column, filter by status instead
        projects_result = await db.execute(
            select(Project)
            .where(
                Project.user_id == current_user.id,
                Project.status.not_in(["cancelled", "archived"]),
            )
            .order_by(Project.created_at.desc())
        )
        projects = projects_result.scalars().all()

        projects_data = []
        for project in projects:
            try:
                # Get client name
                client_name = "Unknown Client"
                if project.client_id:
                    client_result = await db.execute(select(Client).where(Client.id == project.client_id))
                    client = client_result.scalar_one_or_none()
                    client_name = client.name if client else "Unknown Client"

                # Safely calculate budget percentage
                budget_percentage = 0
                try:
                    if project.project_budget and float(project.project_budget) > 0:
                        remaining = float(project.current_budget_remaining) if project.current_budget_remaining else 0
                        budget = float(project.project_budget)
                        budget_percentage = round((remaining / budget) * 100)
                except (TypeError, ValueError) as budget_err:
                    logger.warning(f"Could not calculate budget percentage for project {project.id}: {budget_err}")
                    budget_percentage = 0

                # Determine status
                proj_status = "healthy"
                if project.status == "paused":
                    proj_status = "paused"
                else:
                    # Convert auto_pause_threshold to float for comparison (it's a Decimal in DB)
                    try:
                        threshold = float(getattr(project, "auto_pause_threshold", 10))
                    except (TypeError, ValueError):
                        threshold = 10.0

                    if budget_percentage < threshold:
                        proj_status = "paused"
                    elif budget_percentage < 20:
                        proj_status = "at_risk"
                    elif project.status == "active":
                        proj_status = "active"

                # Safely convert values to float
                try:
                    project_budget = float(project.project_budget) if project.project_budget else 0.0
                except (TypeError, ValueError):
                    project_budget = 0.0

                try:
                    current_budget_remaining = (
                        float(project.current_budget_remaining) if project.current_budget_remaining else 0.0
                    )
                except (TypeError, ValueError):
                    current_budget_remaining = 0.0

                try:
                    total_revenue = float(project.total_revenue) if project.total_revenue else 0.0
                except (TypeError, ValueError):
                    total_revenue = 0.0

                projects_data.append(
                    {
                        "id": str(project.id),
                        "name": project.name,
                        "client_name": client_name,
                        "status": proj_status,
                        "project_budget": project_budget,
                        "current_budget_remaining": current_budget_remaining,
                        "budget_percentage": budget_percentage,
                        "total_revenue": total_revenue,
                        "updated_at": (project.updated_at.isoformat() if project.updated_at else None),
                    }
                )
            except Exception as proj_error:
                logger.error(
                    f"Error processing project {getattr(project, 'id', 'unknown')}: {proj_error}",
                    exc_info=True,
                )
                continue

        # ========== Get Clients ==========
        try:
            clients_result = await db.execute(
                select(Client)
                .where(Client.user_id == current_user.id, Client.is_active == True)
                .order_by(Client.created_at.desc())
            )
            clients = clients_result.scalars().all()

            clients_data = [
                {
                    "id": str(client.id),
                    "name": client.name,
                    "email": client.email,
                    "company": client.company,
                }
                for client in clients
            ]
        except Exception as client_error:
            logger.error(f"Error fetching clients: {client_error}", exc_info=True)
            clients_data = []

        # ========== Get Change Requests ==========
        try:
            cr_result = await db.execute(
                select(ChangeRequest)
                .where(ChangeRequest.user_id == current_user.id)
                .order_by(ChangeRequest.created_at.desc())
                .limit(50)
            )
            change_requests = cr_result.scalars().all()

            change_requests_data = []
            for cr in change_requests:
                try:
                    amount = 0.0
                    if cr.amount is not None:
                        try:
                            amount = float(cr.amount)
                        except (TypeError, ValueError):
                            amount = 0.0

                    change_requests_data.append(
                        {
                            "id": str(cr.id),
                            "project_id": str(cr.project_id) if cr.project_id else None,
                            "title": cr.title,
                            "status": cr.status,
                            "amount": amount,
                            "created_at": (cr.created_at.isoformat() if cr.created_at else None),
                        }
                    )
                except Exception as cr_item_err:
                    logger.warning(f"Error processing change request {cr.id}: {cr_item_err}")
                    continue
        except Exception as cr_error:
            logger.error(f"Error fetching change requests: {cr_error}", exc_info=True)
            change_requests_data = []

        # ========== Get Invoices Summary ==========
        try:
            invoices_result = await db.execute(select(Invoice).where(Invoice.user_id == current_user.id))
            invoices = invoices_result.scalars().all()

            # Safely calculate invoice totals with proper None and type handling
            total_invoiced = 0.0
            total_paid = 0.0

            for inv in invoices:
                if inv.total_amount is not None:
                    try:
                        amount = float(inv.total_amount)
                        total_invoiced += amount
                        if inv.status == "paid":
                            total_paid += amount
                    except (TypeError, ValueError) as amount_err:
                        logger.warning(f"Could not convert invoice amount {inv.total_amount}: {amount_err}")
                        continue

            total_unpaid = total_invoiced - total_paid

            invoices_summary = {
                "total_invoiced": float(total_invoiced),
                "total_paid": float(total_paid),
                "total_unpaid": float(total_unpaid),
                "pending_count": len([inv for inv in invoices if inv.status == "pending"]),
                "paid_count": len([inv for inv in invoices if inv.status == "paid"]),
                "overdue_count": len([inv for inv in invoices if inv.status == "overdue"]),
            }
        except Exception as inv_error:
            logger.error(f"Error fetching invoices: {inv_error}", exc_info=True)
            invoices_summary = {
                "total_invoiced": 0,
                "total_paid": 0,
                "total_unpaid": 0,
                "pending_count": 0,
                "paid_count": 0,
                "overdue_count": 0,
            }

        # ========== Get Time Summary (Last 30 days) ==========
        try:
            # Use timezone-aware datetime to match database column
            thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
            logger.debug(f"Querying time entries since: {thirty_days_ago}")

            time_result = await db.execute(
                select(TimeEntry).where(
                    TimeEntry.user_id == current_user.id,
                    TimeEntry.created_at >= thirty_days_ago,
                )
            )
            time_entries = time_result.scalars().all()
            logger.debug(f"Found {len(time_entries)} time entries")

            total_minutes = sum((te.duration_minutes or 0) for te in time_entries)
            # Safely convert cost to float, handling None and Decimal types
            total_cost = 0.0
            for te in time_entries:
                if te.cost is not None:
                    try:
                        total_cost += float(te.cost)
                    except (TypeError, ValueError) as cost_err:
                        logger.warning(f"Could not convert cost {te.cost} to float: {cost_err}")
                        continue

            # Safely extract dates for days tracked count
            days_tracked = set()
            for te in time_entries:
                if te.created_at:
                    try:
                        # Handle both timezone-aware and naive datetimes
                        if hasattr(te.created_at, "date"):
                            days_tracked.add(te.created_at.date().isoformat())
                    except Exception as date_err:
                        logger.warning(f"Could not extract date from {te.created_at}: {date_err}")

            time_summary = {
                "total_hours": round(total_minutes / 60, 1),
                "total_cost": float(total_cost),
                "entry_count": len(time_entries),
                "days_tracked": len(days_tracked),
            }
        except Exception as time_error:
            logger.error(f"Error fetching time entries: {time_error}", exc_info=True)
            time_summary = {
                "total_hours": 0,
                "total_cost": 0,
                "entry_count": 0,
                "days_tracked": 0,
            }

        # ========== Get Recent Invoices ==========
        try:
            invoices_result = await db.execute(
                select(Invoice).where(Invoice.user_id == current_user.id).order_by(Invoice.created_at.desc()).limit(10)
            )
            recent_invoices_data = invoices_result.scalars().all()

            recent_invoices = []
            for inv in recent_invoices_data:
                try:
                    amount = 0.0
                    if inv.total_amount is not None:
                        try:
                            amount = float(inv.total_amount)
                        except (TypeError, ValueError):
                            amount = 0.0

                    recent_invoices.append(
                        {
                            "id": str(inv.id),
                            "amount": amount,
                            "status": inv.status,
                            "client_name": next(
                                (c["name"] for c in clients_data if c["id"] == str(getattr(inv, "client_id", ""))),
                                "Unknown",
                            ),
                            "created_at": (inv.created_at.isoformat() if inv.created_at else None),
                        }
                    )
                except Exception as recent_inv_item_err:
                    logger.warning(f"Error processing recent invoice {inv.id}: {recent_inv_item_err}")
                    continue
        except Exception as recent_inv_error:
            logger.error(f"Error fetching recent invoices: {recent_inv_error}", exc_info=True)
            recent_invoices = []

        # ========== Get Stats ==========
        try:
            # Project status values: 'awaiting_contract', 'contract_sent', 'active', 'paused', 'completed', 'cancelled'
            stats = {
                "active_projects": len([p for p in projects if p.status == "active"]),
                "total_clients": len(clients),
                "pending_change_requests": len([cr for cr in change_requests if cr.status == "pending"]),
                "overdue_invoices": len([inv for inv in invoices if inv.status == "overdue"]),
            }
        except Exception as stats_error:
            logger.error(f"Error calculating stats: {stats_error}", exc_info=True)
            stats = {
                "active_projects": 0,
                "total_clients": 0,
                "pending_change_requests": 0,
                "overdue_invoices": 0,
            }

        logger.info(f"Dashboard bundle completed for user: {current_user.id}")

        return DashboardBundleResponse(
            projects=projects_data,
            clients=clients_data,
            change_requests=change_requests_data,
            invoices_summary=invoices_summary,
            time_summary=time_summary,
            recent_invoices=recent_invoices,
            stats=stats,
        )
    except HTTPException:
        # Re-raise HTTP exceptions (like 401) as-is
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        user_id = getattr(current_user, "id", "unknown") if current_user else "no_user"
        logger.error(f"Dashboard bundle error for user {user_id}: {e}\n{error_trace}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load dashboard data: {str(e)}",
        )
