"""
Payment Terms Parser Service
Extracts and parses payment terms from contract content using AI.
"""

import json
import logging
import re
from decimal import Decimal
from typing import List, Optional

import httpx

from app.core.config import settings
from app.schemas.payment_milestone import ParsedPaymentTerm, PaymentTermsParseResult, TriggerType

logger = logging.getLogger(__name__)


class PaymentTermsParser:
    """Parse payment terms from contract content using AI"""

    def __init__(self):
        self.api_key = settings.openrouter_api_key
        self.model = settings.ai_model
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"

    async def parse_contract(self, contract_content: str) -> PaymentTermsParseResult:
        """
        Parse contract content to extract payment terms.
        Returns structured payment milestones if found.
        """
        logger.info("Starting contract parsing, content length: %d chars", len(contract_content))

        if not self.api_key:
            logger.error("OpenRouter API key not configured")
            logger.warning("OpenRouter API key not configured - cannot parse payment terms")
            return PaymentTermsParseResult(found=False, terms=[], raw_text="OpenRouter API key not configured")

        logger.info("API key configured, using model: %s", self.model)
        prompt = self._build_prompt(contract_content)

        try:
            logger.info("Calling OpenRouter API...")
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    self.base_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://devhq.app",
                        "X-Title": "DevHQ Payment Parser",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are a contract parser that extracts payment terms. Return valid JSON only.",
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 1000,
                    },
                )

                logger.info("OpenRouter response status: %d", response.status_code)

                if response.status_code != 200:
                    logger.error("OpenRouter API error: %s", response.text)
                    logger.error("OpenRouter API error: %s", response.text)
                    return PaymentTermsParseResult(
                        found=False,
                        terms=[],
                        raw_text=f"AI API error: {response.status_code}",
                    )

                result = response.json()
                content = result["choices"][0]["message"].get("content", "")
                logger.info("AI response received, parsing: %s...", content[:200])

                parsed_result = self._parse_response(content)
                logger.info(
                    "Parsing complete. Found: %s, Terms: %d",
                    parsed_result.found,
                    len(parsed_result.terms),
                )
                return parsed_result

        except Exception as e:
            logger.error("Error parsing payment terms", exc_info=True)
            logger.error("Error parsing payment terms: %s", e)
            return PaymentTermsParseResult(found=False, terms=[], raw_text=f"Error: {str(e)}")

    def _build_prompt(self, contract_content: str) -> str:
        return f"""Analyze this contract and extract payment terms/schedule.

CONTRACT:
{contract_content[:5000]}

Extract payment milestones and return as JSON:
{{
    "found": true/false,
    "terms": [
        {{
            "name": "Payment name (e.g., 'Upfront Deposit', 'Midpoint', 'Final Payment')",
            "percentage": 30,
            "trigger_type": "contract_signed|percentage_complete|milestone_complete|date|manual",
            "trigger_value": "50" (for percentage_complete) or null
        }}
    ],
    "raw_text": "Original payment terms text from contract"
}}

trigger_type meanings:
- contract_signed: Payment due when contract is signed
- percentage_complete: Payment due when X% of deliverables are complete
- milestone_complete: Payment due when a specific milestone is complete
- date: Payment due on a specific date
- manual: Payment triggered manually

If no payment terms found, return {{"found": false, "terms": []}}

Return ONLY valid JSON, no markdown or explanation."""

    def _parse_response(self, content: str) -> PaymentTermsParseResult:
        """Parse AI response into structured result"""
        if not content or not content.strip():
            return PaymentTermsParseResult(found=False, terms=[])

        try:
            # Try direct parse
            data = json.loads(content)
        except json.JSONDecodeError:
            # Try extracting JSON from markdown
            json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
            if json_match:
                try:
                    data = json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    return PaymentTermsParseResult(found=False, terms=[])
            else:
                return PaymentTermsParseResult(found=False, terms=[])

        if not data.get("found", False):
            return PaymentTermsParseResult(found=False, terms=[])

        terms = []
        for term in data.get("terms", []):
            try:
                trigger_type = TriggerType(term.get("trigger_type", "manual"))
                terms.append(
                    ParsedPaymentTerm(
                        name=term.get("name", "Payment"),
                        percentage=Decimal(str(term.get("percentage", 0))),
                        trigger_type=trigger_type,
                        trigger_value=term.get("trigger_value"),
                    )
                )
            except (ValueError, KeyError) as e:
                logger.warning(f"Skipping invalid term: {term}, error: {e}")
                continue

        return PaymentTermsParseResult(found=len(terms) > 0, terms=terms, raw_text=data.get("raw_text"))


# Singleton instance
payment_parser = PaymentTermsParser()
