"""
WebSocket Connection Manager

Manages WebSocket connections and broadcasts messages to connected clients.
"""

import asyncio
import json
import logging
from typing import Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time event broadcasting"""

    def __init__(self):
        # Active WebSocket connections
        self.active_connections: List[WebSocket] = []
        # Connection metadata (user_id, etc.)
        self.connection_metadata: Dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, user_id: str = None):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.append(websocket)

        # Store metadata
        self.connection_metadata[websocket] = {
            "user_id": user_id,
            "connected_at": asyncio.get_event_loop().time(),
        }

        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.connection_metadata:
            del self.connection_metadata[websocket]

        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific WebSocket connection"""
        # Check if websocket is still in active connections
        if websocket not in self.active_connections:
            logger.debug(f"Skipping message to disconnected websocket")
            return

        try:
            # Check if the connection is still open by checking client_state
            if hasattr(websocket, "client_state") and websocket.client_state.name != "CONNECTED":
                logger.debug(
                    f"WebSocket not connected (state: {websocket.client_state.name}), removing from active connections"
                )
                self.disconnect(websocket)
                return

            await websocket.send_json(message)
        except RuntimeError as e:
            # Handle "Unexpected ASGI message 'websocket.send', after sending 'websocket.close'"
            if "websocket.send" in str(e) or "websocket.close" in str(e):
                logger.debug(f"WebSocket already closed, removing from active connections")
                self.disconnect(websocket)
            else:
                logger.error(f"RuntimeError sending personal message: {e}")
                self.disconnect(websocket)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
            self.disconnect(websocket)

    async def broadcast(self, message: dict, exclude: WebSocket = None):
        """Broadcast a message to all connected clients"""
        disconnected = []

        for connection in self.active_connections:
            if connection == exclude:
                continue

            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")
                disconnected.append(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            self.disconnect(connection)

    async def broadcast_to_user(self, message: dict, user_id: str):
        """Broadcast a message to all connections for a specific user"""
        disconnected = []

        for connection, metadata in self.connection_metadata.items():
            if metadata.get("user_id") == user_id:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error broadcasting to user {user_id}: {e}")
                    disconnected.append(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            self.disconnect(connection)

    def get_connection_count(self) -> int:
        """Get the number of active connections"""
        return len(self.active_connections)


# Global instance
manager = ConnectionManager()
