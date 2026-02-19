"""
PDF Generator Tests

Tests for PDF generation functionality including:
- Invoice PDF generation
- Contract PDF generation
- Timeout handling
- Error handling
- Template rendering
"""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from jinja2 import Environment, FileSystemLoader

from app.utils.pdf_generator import (
    MAX_PDF_SIZE_MB,
    PDF_TIMEOUT_SECONDS,
    PDFGenerationQueue,
    format_currency,
    generate_contract_pdf,
    generate_invoice_pdf,
)


class TestFormatCurrency:
    """Tests for the format_currency helper function."""

    def test_format_currency_usd(self):
        """Test formatting decimal as USD currency."""
        assert format_currency(Decimal("100.00")) == "100.00"
        assert format_currency(Decimal("1234.56")) == "1,234.56"
        assert format_currency(Decimal("0.00")) == "0.00"

    def test_format_currency_large_amounts(self):
        """Test formatting large currency amounts."""
        assert format_currency(Decimal("1000000.00")) == "1,000,000.00"
        assert format_currency(Decimal("1234567890.12")) == "1,234,567,890.12"

    def test_format_currency_with_cents(self):
        """Test formatting amounts with cents."""
        assert format_currency(Decimal("99.99")) == "99.99"
        assert format_currency(Decimal("0.01")) == "0.01"


class TestPDFTimeoutConstants:
    """Tests for PDF timeout and size constants."""

    def test_timeout_seconds_set(self):
        """Test that timeout seconds is set to a reasonable value."""
        assert PDF_TIMEOUT_SECONDS == 30

    def test_max_pdf_size_mb(self):
        """Test that max PDF size is set."""
        assert MAX_PDF_SIZE_MB == 10


class TestInvoicePDFGeneration:
    """Tests for invoice PDF generation."""

    @pytest.fixture
    def mock_invoice(self):
        """Create a mock invoice object."""
        invoice = Mock()
        invoice.invoice_number = "INV-001"
        invoice.project_id = 1
        invoice.client_id = 1
        invoice.user_id = 1
        invoice.created_at = datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
        invoice.due_date = datetime(2024, 2, 15, 10, 0, 0, tzinfo=timezone.utc)
        invoice.status = "pending"
        invoice.subtotal = Decimal("1500.00")
        invoice.platform_fee = Decimal("22.50")
        invoice.tax_amount = Decimal("0.00")
        invoice.total_amount = Decimal("1522.50")
        invoice.payment_method = "manual"
        invoice.notes = "Test payment terms"
        invoice.invoice_pdf_url = None
        return invoice

    @pytest.fixture
    def mock_project(self):
        """Create a mock project object."""
        project = Mock()
        project.id = 1
        project.name = "Test Project"
        project.user_id = 1
        project.project_budget = Decimal("10000.00")
        project.max_revisions = 3
        project.auto_pause_threshold = Decimal("8000.00")
        project.contract_pdf_url = None
        return project

    @pytest.fixture
    def mock_client(self):
        """Create a mock client object."""
        client = Mock()
        client.id = 1
        client.name = "Test Client"
        client.company = "Test Company"
        client.email = "client@test.com"
        client.default_hourly_rate = Decimal("150.00")
        client.payment_instructions = "Bank: Test Bank, Account: 12345"
        return client

    @pytest.fixture
    def mock_developer(self):
        """Create a mock developer/user object."""
        developer = Mock()
        developer.id = 1
        developer.full_name = "Test Developer"
        developer.email = "developer@test.com"
        return developer

    @pytest.fixture
    def mock_deliverable(self):
        """Create a mock deliverable object."""
        deliverable = Mock()
        deliverable.title = "Feature Implementation"
        deliverable.actual_hours = Decimal("10.00")
        deliverable.total_cost = Decimal("1500.00")
        deliverable.status = "billed"
        return deliverable

    @pytest.mark.asyncio
    async def test_generate_invoice_pdf_missing_project(self, mock_invoice):
        """Test that ValueError is raised when project is missing."""
        mock_db = AsyncMock()
        mock_db.execute.return_value.scalar_one_or_none.return_value = None

        with pytest.raises(ValueError, match="Project not found"):
            await generate_invoice_pdf(mock_db, mock_invoice)

    @pytest.mark.asyncio
    async def test_generate_invoice_pdf_missing_client(self, mock_invoice, mock_project):
        """Test that ValueError is raised when client is missing."""
        mock_db = AsyncMock()

        execute_results = [
            Mock(scalar_one_or_none=Mock(return_value=mock_project)),
            Mock(scalar_one_or_none=Mock(return_value=None)),
        ]
        mock_db.execute.side_effect = execute_results

        with pytest.raises(ValueError, match="Client not found"):
            await generate_invoice_pdf(mock_db, mock_invoice)

    @pytest.mark.asyncio
    async def test_generate_invoice_pdf_missing_developer(self, mock_invoice, mock_project, mock_client):
        """Test that ValueError is raised when developer is missing."""
        mock_db = AsyncMock()

        execute_results = [
            Mock(scalar_one_or_none=Mock(return_value=mock_project)),
            Mock(scalar_one_or_none=Mock(return_value=mock_client)),
            Mock(scalar_one_or_none=Mock(return_value=None)),
        ]
        mock_db.execute.side_effect = execute_results

        with pytest.raises(ValueError, match="Developer not found"):
            await generate_invoice_pdf(mock_db, mock_invoice)

    @pytest.mark.asyncio
    async def test_generate_invoice_pdf_success(
        self, mock_invoice, mock_project, mock_client, mock_developer, mock_deliverable
    ):
        """Test successful invoice PDF generation."""
        mock_db = AsyncMock()

        execute_results = [
            Mock(scalar_one_or_none=Mock(return_value=mock_project)),
            Mock(scalar_one_or_none=Mock(return_value=mock_client)),
            Mock(scalar_one_or_none=Mock(return_value=mock_developer)),
            Mock(scalars=Mock(all=Mock(return_value=[mock_deliverable]))),
        ]
        mock_db.execute.side_effect = execute_results

        mock_invoice.invoice_pdf_url = None

        with (
            patch("app.utils.pdf_generator._generate_pdf_sync") as mock_pdf,
            patch("app.utils.pdf_generator.cloudinary.uploader.upload") as mock_upload,
            patch("tempfile.NamedTemporaryFile") as mock_temp,
        ):

            mock_pdf.return_value = b"%PDF-1.4 mock pdf content"
            mock_upload.return_value = {"secure_url": "https://cloudinary.com/test.pdf"}

            mock_temp_file = MagicMock()
            mock_temp.return_value.__enter__.return_value = mock_temp_file
            mock_temp.return_value.__exit__.return_value = False

            result = await generate_invoice_pdf(mock_db, mock_invoice)

            assert result == "https://cloudinary.com/test.pdf"
            mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_invoice_pdf_timeout_handling(self, mock_invoice, mock_project, mock_client, mock_developer):
        """Test that timeout errors are properly raised."""
        mock_db = AsyncMock()

        execute_results = [
            Mock(scalar_one_or_none=Mock(return_value=mock_project)),
            Mock(scalar_one_or_none=Mock(return_value=mock_client)),
            Mock(scalar_one_or_none=Mock(return_value=mock_developer)),
            Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=[])))),
        ]
        mock_db.execute.side_effect = execute_results

        with patch("app.utils.pdf_generator._generate_pdf_sync") as mock_pdf:
            mock_pdf.side_effect = asyncio.TimeoutError()

            with pytest.raises(TimeoutError, match="timed out"):
                await generate_invoice_pdf(mock_db, mock_invoice)


class TestContractPDFGeneration:
    """Tests for contract PDF generation."""

    @pytest.fixture
    def mock_contract_signature(self):
        """Create a mock contract signature object."""
        contract = Mock()
        contract.id = 1
        contract.project_id = 1
        contract.client_id = 1
        contract.created_at = datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
        contract.contract_content = "Test contract content"
        contract.client_name_typed = "John Doe"
        contract.signed_at = datetime(2024, 1, 15, 14, 30, 0, tzinfo=timezone.utc)
        contract.signature_ip = "192.168.1.1"
        contract.signature_user_agent = "Mozilla/5.0"
        contract.contract_pdf_url = None
        return contract

    @pytest.fixture
    def mock_project(self):
        """Create a mock project object."""
        project = Mock()
        project.id = 1
        project.name = "Test Project"
        project.user_id = 1
        project.project_budget = Decimal("10000.00")
        project.max_revisions = 3
        project.auto_pause_threshold = Decimal("8000.00")
        project.contract_pdf_url = None
        return project

    @pytest.fixture
    def mock_client(self):
        """Create a mock client object."""
        client = Mock()
        client.id = 1
        client.name = "Test Client"
        client.company = "Test Company"
        client.default_hourly_rate = Decimal("150.00")
        return client

    @pytest.fixture
    def mock_developer(self):
        """Create a mock developer/user object."""
        developer = Mock()
        developer.id = 1
        developer.full_name = "Test Developer"
        developer.email = "developer@test.com"
        return developer

    @pytest.mark.asyncio
    async def test_generate_contract_pdf_missing_project(self, mock_contract_signature):
        """Test that ValueError is raised when project is missing."""
        mock_db = AsyncMock()
        mock_db.execute.return_value.scalar_one_or_none.return_value = None

        with pytest.raises(ValueError, match="Project not found"):
            await generate_contract_pdf(mock_db, mock_contract_signature)

    @pytest.mark.asyncio
    async def test_generate_contract_pdf_success(self, mock_contract_signature, mock_project, mock_client, mock_developer):
        """Test successful contract PDF generation."""
        mock_db = AsyncMock()

        execute_results = [
            Mock(scalar_one_or_none=Mock(return_value=mock_project)),
            Mock(scalar_one_or_none=Mock(return_value=mock_client)),
            Mock(scalar_one_or_none=Mock(return_value=mock_developer)),
        ]
        mock_db.execute.side_effect = execute_results

        with (
            patch("app.utils.pdf_generator._generate_pdf_sync") as mock_pdf,
            patch("app.utils.pdf_generator.cloudinary.uploader.upload") as mock_upload,
            patch("tempfile.NamedTemporaryFile") as mock_temp,
        ):

            mock_pdf.return_value = b"%PDF-1.4 mock pdf content"
            mock_upload.return_value = {"secure_url": "https://cloudinary.com/contract.pdf"}

            mock_temp_file = MagicMock()
            mock_temp.return_value.__enter__.return_value = mock_temp_file
            mock_temp.return_value.__exit__.return_value = False

            result = await generate_contract_pdf(mock_db, mock_contract_signature)

            assert result == "https://cloudinary.com/contract.pdf"
            mock_db.commit.assert_called()


class TestPDFGenerationQueue:
    """Tests for the PDF generation queue."""

    @pytest.fixture
    def queue(self):
        """Create a PDF generation queue for testing."""
        return PDFGenerationQueue(max_size=10)

    def test_queue_initial_state(self, queue):
        """Test queue is empty and not running on initialization."""
        assert queue.get_queue_size() == 0
        assert not queue.is_full()
        assert not queue.running
        assert len(queue.workers) == 0

    @pytest.mark.asyncio
    async def test_start_queue(self, queue):
        """Test starting the queue."""
        await queue.start(num_workers=2)

        assert queue.running
        assert len(queue.workers) == 2

        await queue.stop()

    @pytest.mark.asyncio
    async def test_stop_queue(self, queue):
        """Test stopping the queue."""
        await queue.start(num_workers=2)
        await queue.stop()

        assert not queue.running
        assert len(queue.workers) == 0

    @pytest.mark.asyncio
    async def test_enqueue_when_not_running(self, queue):
        """Test that enqueue returns False when queue is not running."""
        result = await queue.enqueue_invoice_pdf(None, 1)

        assert not result

    @pytest.mark.asyncio
    async def test_queue_size_tracking(self, queue):
        """Test queue size tracking."""
        await queue.start()

        assert queue.get_queue_size() == 0

        await queue.stop()


class TestPDFTemplateRendering:
    """Tests for PDF template rendering."""

    @pytest.fixture
    def jinja_env(self):
        """Create a Jinja2 environment for template testing."""
        templates_dir = Path(__file__).parent.parent / "templates" / "pdf"
        return Environment(loader=FileSystemLoader(str(templates_dir)), autoescape=True)

    def test_invoice_template_renders(self, jinja_env):
        """Test that invoice template can be rendered."""
        template = jinja_env.get_template("invoice_template.html")

        context = {
            "invoice_number": "INV-001",
            "developer_name": "Test Developer",
            "developer_email": "dev@test.com",
            "client_name": "Test Client",
            "client_company": "Test Company",
            "client_email": "client@test.com",
            "invoice_date": "January 15, 2024",
            "due_date": "February 15, 2024",
            "project_name": "Test Project",
            "status": "Pending",
            "line_items": [
                {
                    "description": "Feature",
                    "hours": "10.00",
                    "rate": "150.00",
                    "amount": "1,500.00",
                }
            ],
            "currency": "$",
            "subtotal": "1,500.00",
            "platform_fee": "22.50",
            "tax_amount": "0.00",
            "total_amount": "1,522.50",
            "payment_method": "Manual",
            "payment_instructions": "Bank transfer",
            "notes": None,
        }

        html = template.render(**context)

        assert "INV-001" in html
        assert "Test Developer" in html
        assert "Test Client" in html
        assert "$1,500.00" in html
        assert "$1,522.50" in html

    def test_contract_template_renders(self, jinja_env):
        """Test that contract template can be rendered."""
        template = jinja_env.get_template("contract_template.html")

        context = {
            "project_name": "Test Project",
            "contract_date": "January 15, 2024",
            "developer_name": "Test Developer",
            "client_name": "Test Client",
            "client_company": "Test Company",
            "currency": "$",
            "project_budget": "10,000.00",
            "hourly_rate": "150.00",
            "max_revisions": 3,
            "auto_pause_threshold": "8,000.00",
            "contract_content": "This is a test contract.",
            "client_signature_name": "John Doe",
            "signed_date": "January 15, 2024",
            "signed_time": "02:30 PM UTC",
            "signature_ip": "192.168.1.1",
            "signature_user_agent": "Mozilla/5.0",
            "contract_id": "CONTRACT-1-1",
            "generated_date": "January 15, 2024 at 02:30 PM UTC",
        }

        html = template.render(**context)

        assert "Test Project" in html
        assert "Test Developer" in html
        assert "Test Client" in html
        assert "$10,000.00" in html
        assert "John Doe" in html
        assert "This is a test contract." in html


class TestPDFErrorHandling:
    """Tests for PDF error handling scenarios."""

    @pytest.mark.asyncio
    async def test_pdf_generation_exception_logging(self):
        """Test that exceptions are properly logged."""
        from app.utils.pdf_generator import logger

        mock_invoice = Mock()
        mock_invoice.invoice_number = "INV-001"
        mock_invoice.project_id = 1
        mock_invoice.client_id = 1
        mock_invoice.user_id = 1
        mock_invoice.created_at = datetime.now(timezone.utc)
        mock_invoice.due_date = datetime.now(timezone.utc)
        mock_invoice.status = "pending"
        mock_invoice.subtotal = Decimal("100.00")
        mock_invoice.platform_fee = Decimal("1.50")
        mock_invoice.tax_amount = Decimal("0.00")
        mock_invoice.total_amount = Decimal("101.50")
        mock_invoice.payment_method = None
        mock_invoice.notes = None
        mock_invoice.invoice_pdf_url = None

        mock_db = AsyncMock()
        mock_db.execute.side_effect = Exception("Database connection failed")

        with pytest.raises(Exception):
            await generate_invoice_pdf(mock_db, mock_invoice)

    @pytest.mark.asyncio
    async def test_pdf_size_limit_enforcement(self):
        """Test that PDF size limit is enforced."""
        from app.utils.pdf_generator import _generate_pdf_sync

        large_pdf = b"x" * (11 * 1024 * 1024)

        with patch("app.utils.pdf_generator.HTML") as mock_html:
            mock_html.return_value.write_pdf.return_value = large_pdf

            with pytest.raises(ValueError, match="exceeds.*MB"):
                pass

    def test_cloudinary_deletion_handling(self):
        """Test Cloudinary deletion error handling."""
        from app.utils.pdf_generator import delete_pdf_from_cloudinary

        with patch("app.utils.pdf_generator.cloudinary.uploader.destroy") as mock_destroy:
            mock_destroy.side_effect = Exception("Cloudinary error")

            result = delete_pdf_from_cloudinary("https://cloudinary.com/test.pdf")

            assert not result
