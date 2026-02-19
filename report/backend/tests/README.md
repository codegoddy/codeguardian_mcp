"""
Tests configuration and documentation.

This directory contains:
- conftest.py: Pytest configuration and shared fixtures
- api/: API endpoint tests
- services/: Service layer tests (unit tests)
- integration/: Integration tests (end-to-end flows)

Running Tests:
=============

Run all tests:
    pytest

Run with coverage:
    pytest --cov=app --cov-report=html

Run specific test file:
    pytest tests/test_setup.py

Run tests by marker:
    pytest -m unit          # Fast unit tests only
    pytest -m integration   # Integration tests only
    pytest -m auth          # Authentication tests
    pytest -m slow          # Slow-running tests

Run tests with verbose output:
    pytest -v

Run tests and stop on first failure:
    pytest -x

Run only failed tests from last run:
    pytest --lf

View coverage report:
    Open htmlcov/index.html in your browser

Writing Tests:
==============

Use appropriate fixtures from conftest.py:
- test_client: Synchronous FastAPI test client
- async_test_client: Async HTTP client for testing endpoints
- test_db_session: Database session for testing
- test_user/test_admin: Pre-created test users
- auth_token/auth_headers: Authentication tokens/headers
- mock_nats_client: Mocked NATS client
- mock_brevo_email: Mocked email service

Example test:
```python
import pytest
from fastapi.testclient import TestClient

def test_create_project(test_client: TestClient, auth_headers: dict):
    response = test_client.post(
        "/api/v1/projects",
        json={"name": "Test Project"},
        headers=auth_headers,
    )
    assert response.status_code == 201
```

Markers:
========
Use pytest.mark decorators to organize tests:
- @pytest.mark.unit: Unit tests (fast, isolated)
- @pytest.mark.integration: Integration tests (require DB, external services)
- @pytest.mark.slow: Slow-running tests
- @pytest.mark.auth: Authentication-related tests
- @pytest.mark.api: API endpoint tests
- @pytest.mark.database: Database-related tests
- @pytest.mark.email: Email service tests
- @pytest.mark.payment: Payment processing tests
- @pytest.mark.webhook: Webhook tests
"""