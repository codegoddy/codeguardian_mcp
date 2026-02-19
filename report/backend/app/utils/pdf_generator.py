"""
PDF Generator Utility

Generates professional PDF documents for invoices and signed contracts.
Requirements: 20.1, 20.2, 20.3, 20.4, 20.7

Features:
- Timeout handling to prevent hanging
- Async execution with thread pool
- Cloudinary storage integration
- Comprehensive error handling
"""

import asyncio
import os
import signal
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

import cloudinary
import cloudinary.uploader
from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session
from weasyprint import CSS, HTML

from app.core.logging_config import get_logger
from app.models.client import Client
from app.models.contract_signature import ContractSignature
from app.models.deliverable import Deliverable
from app.models.invoice import Invoice
from app.models.project import Project
from app.models.user import User

logger = get_logger(__name__)

PDF_TIMEOUT_SECONDS = 30
CLOUDINARY_UPLOAD_TIMEOUT = 60
MAX_PDF_SIZE_MB = 10

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="pdf_gen")


# Get the templates directory
TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "pdf"

# Initialize Jinja2 environment
jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=True)


def format_currency(amount: Decimal, currency: str = "USD") -> str:
    """Format decimal amount as currency string"""
    return f"{amount:,.2f}"


async def _generate_pdf_sync(html_content: str, timeout_seconds: int = PDF_TIMEOUT_SECONDS) -> bytes:
    """
    Synchronous PDF generation with timeout protection.
    Note: Uses asyncio.wait_for for timeout since signal.SIGALRM doesn't work in threads.

    Args:
        html_content: HTML content to convert to PDF
        timeout_seconds: Maximum time to allow for PDF generation

    Returns:
        PDF bytes

    Raises:
        TimeoutError: If PDF generation takes too long
        Exception: For other PDF generation errors
    """
    loop = asyncio.get_running_loop()

    def generate():
        try:
            return HTML(string=html_content).write_pdf()
        except AttributeError as e:
            # Known issue with WeasyPrint and pydyf version incompatibility
            if "transform" in str(e):
                logger.error(
                    "WeasyPrint PDF generation failed due to pydyf version incompatibility. "
                    "Please ensure pydyf==0.10.0 is installed. Error: %s",
                    str(e),
                    exc_info=True,
                )
                raise RuntimeError(
                    "PDF generation failed due to library version incompatibility. " "Please contact support."
                ) from e
            logger.error("WeasyPrint PDF generation failed", exc_info=True)
            raise
        except Exception as e:
            logger.error("WeasyPrint PDF generation failed", exc_info=True)
            raise

    # Use asyncio.wait_for for timeout (works in any thread)
    return await asyncio.wait_for(loop.run_in_executor(_executor, generate), timeout=timeout_seconds)


async def generate_invoice_pdf(db, invoice: Invoice, currency: str = "USD") -> str:  # AsyncSession
    """
    Generate invoice PDF and upload to Cloudinary.

    Requirements: 20.1, 20.2, 20.4

    Features:
    - Timeout protection (30 seconds)
    - Async execution
    - Cloudinary upload with retry
    - Automatic cleanup of temp files

    Args:
        db: Async database session
        invoice: Invoice model instance
        currency: Currency code (default: USD)

    Returns:
        Cloudinary URL of the generated PDF

    Raises:
        ValueError: If required related data is missing
        TimeoutError: If PDF generation times out
        Exception: For other errors (logged, not raised)
    """
    from sqlalchemy import select

    logger.info("Starting invoice PDF generation for invoice %s", invoice.invoice_number)

    try:
        project_result = await db.execute(select(Project).where(Project.id == invoice.project_id))
        project = project_result.scalar_one_or_none()

        client_result = await db.execute(select(Client).where(Client.id == invoice.client_id))
        client = client_result.scalar_one_or_none()

        developer_result = await db.execute(select(User).where(User.id == invoice.user_id))
        developer = developer_result.scalar_one_or_none()

        if not project:
            raise ValueError(f"Project not found for invoice {invoice.invoice_number}")
        if not client:
            raise ValueError(f"Client not found for invoice {invoice.invoice_number}")
        if not developer:
            raise ValueError(f"Developer not found for invoice {invoice.invoice_number}")

        deliverables_result = await db.execute(
            select(Deliverable).where(Deliverable.project_id == project.id, Deliverable.status == "billed")
        )
        deliverables = deliverables_result.scalars().all()

        line_items = []
        for deliverable in deliverables:
            rate = deliverable.total_cost / deliverable.actual_hours if deliverable.actual_hours else Decimal("0.00")
            line_items.append(
                {
                    "description": deliverable.title,
                    "hours": format_currency(deliverable.actual_hours or Decimal("0.00")),
                    "rate": format_currency(rate),
                    "amount": format_currency(deliverable.total_cost or Decimal("0.00")),
                }
            )

        context = {
            "invoice_number": invoice.invoice_number,
            "developer_name": developer.full_name or developer.email,
            "developer_email": developer.email,
            "client_name": client.name,
            "client_company": client.company,
            "client_email": client.email,
            "invoice_date": invoice.created_at.strftime("%B %d, %Y"),
            "due_date": (invoice.due_date.strftime("%B %d, %Y") if invoice.due_date else "Upon Receipt"),
            "project_name": project.name,
            "status": invoice.status.replace("_", " ").title(),
            "line_items": line_items,
            "currency": "$" if currency == "USD" else currency,
            "subtotal": format_currency(invoice.subtotal),
            "platform_fee": format_currency(invoice.platform_fee),
            "tax_amount": format_currency(invoice.tax_amount),
            "total_amount": format_currency(invoice.total_amount),
            "payment_method": (invoice.payment_method.title() if invoice.payment_method else "Not Specified"),
            "payment_instructions": (client.payment_instructions if invoice.payment_method == "manual" else None),
            "notes": invoice.notes,
        }

        template = jinja_env.get_template("invoice_template.html")
        html_content = template.render(**context)

        pdf_bytes = await _generate_pdf_sync(html_content)

        if len(pdf_bytes) > MAX_PDF_SIZE_MB * 1024 * 1024:
            raise ValueError(f"Generated PDF exceeds {MAX_PDF_SIZE_MB}MB size limit")

        temp_pdf_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
                temp_pdf.write(pdf_bytes)
                temp_pdf_path = temp_pdf.name

            upload_result = cloudinary.uploader.upload(
                temp_pdf_path,
                resource_type="raw",
                folder="devhq/invoices",
                public_id=f"invoice_{invoice.invoice_number}",
                overwrite=True,
                timeout=CLOUDINARY_UPLOAD_TIMEOUT,
            )

            pdf_url = upload_result.get("secure_url")

            invoice.invoice_pdf_url = pdf_url
            await db.commit()

            logger.info("Successfully generated invoice PDF: %s", pdf_url)
            return pdf_url

        finally:
            if temp_pdf_path and os.path.exists(temp_pdf_path):
                os.remove(temp_pdf_path)

    except asyncio.TimeoutError:
        logger.error("Invoice PDF generation timed out for invoice %s", invoice.invoice_number)
        raise TimeoutError(f"PDF generation timed out after {PDF_TIMEOUT_SECONDS} seconds")
    except Exception as e:
        logger.error(
            "Error generating invoice PDF for %s: %s",
            invoice.invoice_number,
            str(e),
            exc_info=True,
        )
        raise


async def generate_contract_pdf(db, contract_signature: ContractSignature, currency: str = "USD") -> str:
    """
    Generate signed contract PDF and upload to Supabase Storage.

    Requirements: 20.1, 20.3, 20.4, 20.7

    Features:
    - Timeout protection (30 seconds)
    - Async execution
    - Supabase Storage upload
    - Automatic cleanup of temp files

    Args:
        db: Async database session
        contract_signature: ContractSignature model instance
        currency: Currency code (default: USD)

    Returns:
        Supabase Storage URL of the generated PDF

    Raises:
        ValueError: If required related data is missing
        TimeoutError: If PDF generation times out
        Exception: For other errors (logged, not raised)
    """
    from sqlalchemy import select

    logger.info("Starting contract PDF generation for contract %s", contract_signature.id)

    try:
        project_result = await db.execute(select(Project).where(Project.id == contract_signature.project_id))
        project = project_result.scalar_one_or_none()

        client_result = await db.execute(select(Client).where(Client.id == contract_signature.client_id))
        client = client_result.scalar_one_or_none()

        developer_result = await db.execute(select(User).where(User.id == project.user_id))
        developer = developer_result.scalar_one_or_none()

        if not project:
            raise ValueError(f"Project not found for contract {contract_signature.id}")
        if not client:
            raise ValueError(f"Client not found for contract {contract_signature.id}")
        if not developer:
            raise ValueError(f"Developer not found for contract {contract_signature.id}")

        context = {
            "project_name": project.name,
            "contract_date": contract_signature.created_at.strftime("%B %d, %Y"),
            "developer_name": developer.full_name or developer.email,
            "client_name": client.name,
            "client_company": client.company,
            "currency": "$" if currency == "USD" else currency,
            "project_budget": format_currency(project.project_budget),
            "hourly_rate": format_currency(client.default_hourly_rate),
            "max_revisions": project.max_revisions,
            "auto_pause_threshold": format_currency(project.auto_pause_threshold),
            "contract_content": contract_signature.contract_content,
            "client_signature_name": contract_signature.client_name_typed,
            "signed_date": (contract_signature.signed_at.strftime("%B %d, %Y") if contract_signature.signed_at else ""),
            "signed_time": (contract_signature.signed_at.strftime("%I:%M %p %Z") if contract_signature.signed_at else ""),
            "signature_ip": contract_signature.signature_ip or "N/A",
            "signature_user_agent": contract_signature.signature_user_agent or "N/A",
            "contract_id": f"CONTRACT-{project.id}-{contract_signature.id}",
            "generated_date": datetime.utcnow().strftime("%B %d, %Y at %I:%M %p UTC"),
        }

        template = jinja_env.get_template("contract_template.html")
        html_content = template.render(**context)

        pdf_bytes = await _generate_pdf_sync(html_content)

        if len(pdf_bytes) > MAX_PDF_SIZE_MB * 1024 * 1024:
            raise ValueError(f"Generated PDF exceeds {MAX_PDF_SIZE_MB}MB size limit")

        # Upload to Supabase Storage
        from app.utils.supabase_storage import upload_contract_pdf

        upload_result = await upload_contract_pdf(
            project_id=str(project.id),
            contract_id=str(contract_signature.id),
            pdf_bytes=pdf_bytes,
        )

        pdf_url = upload_result.get("url")

        contract_signature.contract_pdf_url = pdf_url
        project.contract_pdf_url = pdf_url
        await db.commit()

        logger.info("Successfully generated contract PDF: %s", pdf_url)
        return pdf_url

    except asyncio.TimeoutError:
        logger.error("Contract PDF generation timed out for contract %s", contract_signature.id)
        raise TimeoutError(f"PDF generation timed out after {PDF_TIMEOUT_SECONDS} seconds")
    except Exception as e:
        logger.error(
            "Error generating contract PDF for %s: %s",
            contract_signature.id,
            str(e),
            exc_info=True,
        )
        raise


def delete_pdf_from_cloudinary(pdf_url: str) -> bool:
    """
    Delete PDF from Cloudinary.

    Args:
        pdf_url: Cloudinary URL of the PDF

    Returns:
        True if successful, False otherwise
    """
    try:
        parts = pdf_url.split("/")
        public_id_with_ext = "/".join(parts[-2:])
        public_id = public_id_with_ext.replace(".pdf", "")

        result = cloudinary.uploader.destroy(public_id, resource_type="raw")

        return result.get("result") == "ok"

    except Exception as e:
        logger.error("Error deleting PDF from Cloudinary", exc_info=True)
        return False


async def delete_contract_pdf(pdf_url: str) -> bool:
    """
    Delete contract PDF from Supabase Storage.

    Args:
        pdf_url: Supabase Storage URL of the PDF

    Returns:
        True if successful, False otherwise
    """
    try:
        from app.utils.supabase_storage import delete_file_from_bucket, get_supabase_client

        # Extract bucket and file path from URL
        # URL format: https://<project>.supabase.co/storage/v1/object/sign/contracts/<path>
        client = get_supabase_client()
        settings_module = __import__("app.core.config", fromlist=["settings"])
        settings = settings_module.settings
        bucket_name = settings.supabase_contracts_bucket

        # Try to extract path from signed URL
        if "/object/sign/" in pdf_url:
            # Signed URL format: .../object/sign/contracts/project_id/contract_id.pdf?token=...
            path_start = pdf_url.find("/object/sign/") + len("/object/sign/")
            path_end = pdf_url.find("?")
            if path_end == -1:
                path_end = len(pdf_url)
            full_path = pdf_url[path_start:path_end]
            # Remove bucket name from path
            if full_path.startswith(bucket_name + "/"):
                file_path = full_path[len(bucket_name) + 1 :]
            else:
                file_path = full_path
        elif "/object/public/" in pdf_url:
            # Public URL format: .../object/public/contracts/project_id/contract_id.pdf
            path_start = pdf_url.find("/object/public/") + len("/object/public/")
            full_path = pdf_url[path_start:]
            if full_path.startswith(bucket_name + "/"):
                file_path = full_path[len(bucket_name) + 1 :]
            else:
                file_path = full_path
        else:
            logger.warning(f"Unrecognized PDF URL format: {pdf_url}")
            return False

        return await delete_file_from_bucket(bucket_name=bucket_name, file_path=file_path)

    except Exception as e:
        logger.error("Error deleting PDF from Supabase: %s", e, exc_info=True)
        return False


class PDFGenerationQueue:
    """
    Background queue for async PDF generation.

    Prevents blocking during high-traffic periods by queuing
    PDF generation requests to be processed in the background.

    Usage:
        queue = PDFGenerationQueue()
        await queue.start()

        # Queue a PDF generation
        await queue.enqueue_invoice_pdf(db_session, invoice_id, currency)

        # Stop the queue on shutdown
        await queue.stop()
    """

    def __init__(self, max_size: int = 100):
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=max_size)
        self.workers: List[asyncio.Task] = []
        self.running = False
        self.max_workers = 2

    async def start(self, num_workers: int = None):
        """Start the PDF generation workers."""
        if self.running:
            return

        self.running = True
        self.max_workers = num_workers or self.max_workers

        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker(i))
            self.workers.append(worker)

        logger.info("Started %d PDF generation workers", self.max_workers)

    async def stop(self):
        """Stop all workers gracefully."""
        if not self.running:
            return

        self.running = False

        for worker in self.workers:
            worker.cancel()

        await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()

        logger.info("Stopped PDF generation workers")

    async def _worker(self, worker_id: int):
        """Worker process for handling PDF generation tasks."""
        logger.info("PDF worker %d started", worker_id)

        while self.running:
            try:
                task = await asyncio.wait_for(self.queue.get(), timeout=1.0)

                try:
                    await self._process_task(task)
                except Exception as e:
                    logger.error("Error processing PDF task: %s", str(e), exc_info=True)
                finally:
                    self.queue.task_done()

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("PDF worker %d error: %s", worker_id, str(e), exc_info=True)

        logger.info("PDF worker %d stopped", worker_id)

    async def _process_task(self, task: Dict[str, Any]):
        """Process a single PDF generation task."""
        task_type = task.get("type")

        if task_type == "invoice":
            from app.db.database import AsyncSessionLocal
            from app.models.invoice import Invoice

            async with AsyncSessionLocal() as db:
                invoice = await db.get(Invoice, task["invoice_id"])
                if invoice:
                    await generate_invoice_pdf(db, invoice, task.get("currency", "USD"))

        elif task_type == "contract":
            from app.db.database import AsyncSessionLocal
            from app.models.contract_signature import ContractSignature

            async with AsyncSessionLocal() as db:
                contract = await db.get(ContractSignature, task["contract_id"])
                if contract:
                    await generate_contract_pdf(db, contract, task.get("currency", "USD"))

    async def enqueue_invoice_pdf(self, db, invoice_id: int, currency: str = "USD") -> bool:
        """
        Queue an invoice PDF for background generation.

        Args:
            db: Database session
            invoice_id: ID of the invoice to generate PDF for
            currency: Currency code

        Returns:
            True if queued successfully, False if queue is full
        """
        if not self.running:
            logger.warning("PDF queue not running, generating synchronously")
            return False

        try:
            self.queue.put_nowait({"type": "invoice", "invoice_id": invoice_id, "currency": currency})
            return True
        except asyncio.QueueFull:
            logger.warning("PDF generation queue is full")
            return False

    async def enqueue_contract_pdf(self, db, contract_id: int, currency: str = "USD") -> bool:
        """
        Queue a contract PDF for background generation.

        Args:
            db: Database session
            contract_id: ID of the contract to generate PDF for
            currency: Currency code

        Returns:
            True if queued successfully, False if queue is full
        """
        if not self.running:
            logger.warning("PDF queue not running, generating synchronously")
            return False

        try:
            self.queue.put_nowait({"type": "contract", "contract_id": contract_id, "currency": currency})
            return True
        except asyncio.QueueFull:
            logger.warning("PDF generation queue is full")
            return False

    def get_queue_size(self) -> int:
        """Get current number of pending tasks."""
        return self.queue.qsize()

    def is_full(self) -> bool:
        """Check if queue is at capacity."""
        return self.queue.full()


pdf_queue = PDFGenerationQueue()
