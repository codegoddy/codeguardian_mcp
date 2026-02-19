from typing import Any, Dict, List

import httpx

from app.core.config import settings


class PaystackClient:
    """Client for interacting with Paystack API"""

    BASE_URL = "https://api.paystack.co"

    def __init__(self):
        paystack_config = settings.paystack_config
        self.secret_key = paystack_config["secret_key"]
        self.public_key = paystack_config["public_key"]
        self.webhook_secret = paystack_config["webhook_secret"]
        self.headers = {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
        }

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Dict[str, Any] = None,
        params: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """Make HTTP request to Paystack API"""
        url = f"{self.BASE_URL}{endpoint}"

        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data,
                params=params,
                timeout=30.0,
            )

            response.raise_for_status()
            return response.json()

    async def list_banks(self, country: str = "kenya") -> List[Dict[str, Any]]:
        """
        List all supported banks in a country

        Args:
            country: Country code (default: kenya)

        Returns:
            List of bank objects
        """
        response = await self._make_request(method="GET", endpoint="/bank", params={"country": country, "perPage": 100})

        if response.get("status"):
            return response.get("data", [])
        else:
            raise Exception(f"Failed to fetch banks: {response.get('message')}")

    async def resolve_account_number(self, account_number: str, bank_code: str) -> Dict[str, Any]:
        """
        Verify bank account number

        Args:
            account_number: Bank account number
            bank_code: Bank code from list_banks

        Returns:
            Account details including account name
        """
        response = await self._make_request(
            method="GET",
            endpoint="/bank/resolve",
            params={"account_number": account_number, "bank_code": bank_code},
        )

        if response.get("status"):
            return response.get("data", {})
        else:
            raise Exception(f"Failed to resolve account: {response.get('message')}")

    async def create_subaccount(
        self,
        business_name: str,
        settlement_bank: str,
        account_number: str,
        percentage_charge: float,
    ) -> Dict[str, Any]:
        """
        Create a Paystack subaccount

        Args:
            business_name: Business name for the subaccount
            settlement_bank: Bank code
            account_number: Bank account number
            percentage_charge: Percentage of transaction to charge (e.g., 1.5 for 1.5%)

        Returns:
            Subaccount details including subaccount_code
        """
        data = {
            "business_name": business_name,
            "settlement_bank": settlement_bank,
            "account_number": account_number,
            "percentage_charge": percentage_charge,
        }

        response = await self._make_request(method="POST", endpoint="/subaccount", data=data)

        if response.get("status"):
            return response.get("data", {})
        else:
            raise Exception(f"Failed to create subaccount: {response.get('message')}")

    async def update_subaccount(
        self,
        subaccount_code: str,
        business_name: str = None,
        settlement_bank: str = None,
        account_number: str = None,
        percentage_charge: float = None,
        active: bool = None,
    ) -> Dict[str, Any]:
        """
        Update a Paystack subaccount

        Args:
            subaccount_code: Subaccount code to update
            business_name: New business name (optional)
            settlement_bank: New bank code (optional)
            account_number: New account number (optional)
            percentage_charge: New percentage charge (optional)
            active: Active status (optional)

        Returns:
            Updated subaccount details
        """
        data = {}
        if business_name is not None:
            data["business_name"] = business_name
        if settlement_bank is not None:
            data["settlement_bank"] = settlement_bank
        if account_number is not None:
            data["account_number"] = account_number
        if percentage_charge is not None:
            data["percentage_charge"] = percentage_charge
        if active is not None:
            data["active"] = active

        response = await self._make_request(method="PUT", endpoint=f"/subaccount/{subaccount_code}", data=data)

        if response.get("status"):
            return response.get("data", {})
        else:
            raise Exception(f"Failed to update subaccount: {response.get('message')}")

    async def fetch_subaccount(self, subaccount_code: str) -> Dict[str, Any]:
        """
        Fetch subaccount details

        Args:
            subaccount_code: Subaccount code

        Returns:
            Subaccount details
        """
        response = await self._make_request(method="GET", endpoint=f"/subaccount/{subaccount_code}")

        if response.get("status"):
            return response.get("data", {})
        else:
            raise Exception(f"Failed to fetch subaccount: {response.get('message')}")

    async def initialize_transaction(
        self,
        email: str,
        amount: int,
        reference: str,
        callback_url: str = None,
        subaccount: str = None,
        transaction_charge: int = None,
        bearer: str = "account",
    ) -> Dict[str, Any]:
        """
        Initialize a Paystack transaction

        Args:
            email: Customer email
            amount: Amount in kobo (smallest currency unit)
            reference: Unique transaction reference
            callback_url: URL to redirect after payment
            subaccount: Subaccount code for split payment
            transaction_charge: Flat fee in kobo to charge the subaccount
            bearer: Who bears Paystack charges ('account' or 'subaccount')

        Returns:
            Transaction initialization data including authorization_url
        """
        data = {
            "email": email,
            "amount": amount,
            "reference": reference,
            "bearer": bearer,
        }

        if callback_url:
            data["callback_url"] = callback_url

        if subaccount:
            data["subaccount"] = subaccount

        if transaction_charge is not None:
            data["transaction_charge"] = transaction_charge

        response = await self._make_request(method="POST", endpoint="/transaction/initialize", data=data)

        if response.get("status"):
            return response.get("data", {})
        else:
            raise Exception(f"Failed to initialize transaction: {response.get('message')}")

    async def verify_transaction(self, reference: str) -> Dict[str, Any]:
        """
        Verify a transaction

        Args:
            reference: Transaction reference

        Returns:
            Transaction details
        """
        response = await self._make_request(method="GET", endpoint=f"/transaction/verify/{reference}")

        if response.get("status"):
            return response.get("data", {})
        else:
            raise Exception(f"Failed to verify transaction: {response.get('message')}")

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """
        Verify Paystack webhook signature

        Args:
            payload: Raw request body as bytes
            signature: X-Paystack-Signature header value

        Returns:
            True if signature is valid, False otherwise
        """
        import hashlib
        import hmac

        # Use webhook_secret if available, otherwise fall back to secret_key
        secret = self.webhook_secret if self.webhook_secret else self.secret_key

        computed_signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha512).hexdigest()

        return hmac.compare_digest(computed_signature, signature)


# Singleton instance
paystack_client = PaystackClient()
