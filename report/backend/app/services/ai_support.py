"""
AI Support Assistant Service
Provides AI-powered support chat using OpenRouter API
"""

import json
import logging
import re
from datetime import datetime
from typing import ClassVar, Dict, List, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class AISupportAssistant:
    """AI-powered support assistant using OpenRouter"""

    # Shared HTTP client for connection reuse
    _client: ClassVar[Optional[httpx.AsyncClient]] = None

    # Import knowledge base
    @staticmethod
    def get_system_prompt() -> str:
        """Get complete system prompt with knowledge base."""
        from app.services.devhq_knowledge_base import DEVHQ_KNOWLEDGE_BASE

        return f"""You are the DevHQ Support Assistant, an AI helper for the DevHQ freelance developer platform.

**Your Role:**
- Help users understand DevHQ features
- Answer questions about projects, invoicing, time tracking, contracts, deliverables, and all platform features
- Provide accurate step-by-step guidance based on the knowledge base below
- Be friendly, helpful, and concise
- If you don't know something specific, suggest contacting support@devhq.site

**CRITICAL GUIDELINES:**
- ALWAYS refer to the knowledge base below for accurate information
- Projects are created through the WEB UI (Projects page), NOT through the CLI
- The CLI is ONLY for time tracking with commands like `devhq start DEL-XXX`
- Be accurate - don't make up features or commands that don't exist
- Keep responses concise and helpful (2-4 sentences for simple questions, bullet points for complex ones)
- For billing/payment issues, recommend contacting support directly

---

{DEVHQ_KNOWLEDGE_BASE}

---

Remember: Accuracy is critical. Always base your answers on the knowledge base above. If something isn't covered, say so and recommend support@devhq.site."""

    def __init__(self):
        """Initialize OpenRouter API client"""
        self.api_key = settings.openrouter_api_key
        self.model = settings.ai_model
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"

        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not configured - AI support will fail")
        else:
            logger.info(f"AI Support Assistant initialized with OpenRouter ({self.model})")

    @classmethod
    async def get_client(cls) -> httpx.AsyncClient:
        """Get or create shared async HTTP client for connection reuse"""
        if cls._client is None or cls._client.is_closed:
            cls._client = httpx.AsyncClient(
                timeout=httpx.Timeout(60.0, connect=10.0),
                limits=httpx.Limits(max_keepalive_connections=5),
                http2=True,
            )
        return cls._client

    async def chat(self, user_message: str, conversation_history: List[Dict[str, str]] = None) -> str:
        """
        Send a message to the AI support assistant and get a response.

        Args:
            user_message: The user's message
            conversation_history: Previous messages for context
                                  Format: [{"role": "user"|"assistant", "content": "..."}]

        Returns:
            The assistant's response text
        """
        if not self.api_key:
            return (
                "I'm sorry, the AI support service is currently unavailable. Please contact support@devhq.site for assistance."
            )

        # Build messages array with comprehensive knowledge base
        messages = [{"role": "system", "content": self.get_system_prompt()}]

        # Add conversation history (limit to last 10 messages for context window)
        if conversation_history:
            recent_history = conversation_history[-10:]
            for msg in recent_history:
                messages.append({"role": msg["role"], "content": msg["content"]})

        # Add current user message
        messages.append({"role": "user", "content": user_message})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://devhq.site",
            "X-Title": "DevHQ Support Assistant",
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 500,
        }

        try:
            logger.info(f"Sending support chat request to OpenRouter ({self.model})")

            client = await self.get_client()
            response = await client.post(self.base_url, headers=headers, json=payload)

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"OpenRouter API error ({response.status_code}): {error_detail}")
                return "I'm having trouble connecting right now. Please try again in a moment, or contact support@devhq.site."

            result_data = response.json()
            content = result_data["choices"][0]["message"].get("content", "")

            if not content or content.strip() == "":
                logger.error("AI returned empty response")
                return "I couldn't generate a response. Please try rephrasing your question."

            logger.info(f"Support chat response received ({len(content)} chars)")
            return content.strip()

        except httpx.TimeoutException:
            logger.error("OpenRouter API timeout")
            return "The request timed out. Please try again."
        except Exception as e:
            logger.error(f"Support chat error: {e}")
            return "An error occurred. Please try again or contact support@devhq.site."
