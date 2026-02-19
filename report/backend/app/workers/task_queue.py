"""
Background Task Queue for Non-Critical Operations

This module provides an asyncio-based task queue for running
non-critical operations in the background without blocking
NATS event handlers.

Features:
- Priority queue for task scheduling
- Worker pool for concurrent task execution
- Graceful shutdown handling
- Task timeout and retry logic
- Dead letter queue for failed tasks

Usage:
    from app.workers.task_queue import task_queue, TaskPriority

    # Add a task to the queue
    await task_queue.add_task(
        func=send_email,
        args=[to_email, subject, body],
        priority=TaskPriority.LOW,
        timeout=30.0
    )
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, List, Optional

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class TaskPriority(Enum):
    """Task priority levels"""

    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3


@dataclass
class Task:
    """Background task with metadata"""

    func: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    timeout: float = 30.0
    max_retries: int = 3
    retry_count: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    task_id: str = field(init=False)

    def __post_init__(self):
        self.task_id = f"{self.func.__name__}_{self.created_at.timestamp()}"


class TaskQueue:
    """
    Background task queue for non-critical operations.

    Uses priority queue with asyncio worker pool for concurrent execution.
    """

    def __init__(
        self,
        max_workers: int = 10,
        max_queue_size: int = 1000,
        dead_letter_enabled: bool = True,
    ):
        self.max_workers = max_workers
        self.max_queue_size = max_queue_size
        self.dead_letter_enabled = dead_letter_enabled

        self._queue: asyncio.PriorityQueue[Task] = asyncio.PriorityQueue(maxsize=max_queue_size)
        self._workers: List[asyncio.Task] = []
        self._dead_letter: List[Task] = []
        self._running = False
        self._stop_event = asyncio.Event()

        self.stats = {
            "tasks_queued": 0,
            "tasks_completed": 0,
            "tasks_failed": 0,
            "tasks_timeout": 0,
            "dead_letter_count": 0,
        }

    async def start(self):
        """Start the task queue workers."""
        if self._running:
            logger.warning("Task queue is already running")
            return

        self._running = True
        self._stop_event.clear()

        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker(i))
            self._workers.append(worker)

        logger.info(
            "Task queue started with %d workers (max queue size: %d)",
            self.max_workers,
            self.max_queue_size,
        )

    async def stop(self, timeout: float = 30.0):
        """
        Stop the task queue and wait for workers to finish.

        Args:
            timeout: Maximum time to wait for workers to finish (seconds)
        """
        if not self._running:
            return

        logger.info("Stopping task queue...")
        self._stop_event.set()

        # Wait for queue to empty or timeout
        try:
            await asyncio.wait_for(self._queue.join(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning("Task queue shutdown timed out after %.1f seconds", timeout)

        # Cancel all workers
        for worker in self._workers:
            worker.cancel()

        # Wait for workers to finish
        await asyncio.gather(*self._workers, return_exceptions=True)

        self._running = False
        logger.info("Task queue stopped")

        # Log dead letter tasks
        if self._dead_letter:
            logger.warning("Dead letter queue contains %d failed tasks", len(self._dead_letter))

    async def add_task(
        self,
        func: Callable,
        args: Optional[tuple] = None,
        kwargs: Optional[dict] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> bool:
        """
        Add a task to the background queue.

        Args:
            func: Async function to execute
            args: Positional arguments for the function
            kwargs: Keyword arguments for the function
            priority: Task priority (CRITICAL, HIGH, NORMAL, LOW)
            timeout: Maximum execution time in seconds
            max_retries: Maximum number of retry attempts

        Returns:
            bool: True if task was added, False if queue is full
        """
        if not self._running:
            logger.error("Cannot add task: task queue is not running")
            return False

        task = Task(
            func=func,
            args=args or (),
            kwargs=kwargs or {},
            priority=priority,
            timeout=timeout,
            max_retries=max_retries,
        )

        try:
            self._queue.put_nowait((task.priority.value, task))
            self.stats["tasks_queued"] += 1
            logger.debug(
                "Task added to queue: %s (priority: %s, queue size: %d)",
                task.task_id,
                task.priority.name,
                self._queue.qsize(),
            )
            return True
        except asyncio.QueueFull:
            logger.error("Task queue is full, cannot add task: %s", task.task_id)
            return False

    async def _worker(self, worker_id: int):
        """Worker task that processes tasks from the queue."""
        logger.debug("Task queue worker %d started", worker_id)

        while not self._stop_event.is_set():
            try:
                # Wait for task with timeout to allow checking stop_event
                priority, task = await asyncio.wait_for(self._queue.get(), timeout=1.0)

                try:
                    # Execute task with timeout
                    await asyncio.wait_for(task.func(*task.args, **task.kwargs), timeout=task.timeout)

                    self.stats["tasks_completed"] += 1
                    logger.debug("Task completed: %s (worker: %d)", task.task_id, worker_id)

                except asyncio.TimeoutError:
                    task.retry_count += 1
                    self.stats["tasks_timeout"] += 1
                    logger.warning(
                        "Task timeout: %s (worker: %d, attempt %d/%d)",
                        task.task_id,
                        worker_id,
                        task.retry_count,
                        task.max_retries,
                    )

                    # Retry if under max_retries
                    if task.retry_count < task.max_retries:
                        await self._retry_task(task)
                    else:
                        await self._move_to_dead_letter(task, "max retries exceeded")

                except Exception as e:
                    task.retry_count += 1
                    self.stats["tasks_failed"] += 1
                    logger.error(
                        "Task failed: %s (worker: %d, attempt %d/%d): %s",
                        task.task_id,
                        worker_id,
                        task.retry_count,
                        task.max_retries,
                        str(e),
                        exc_info=True,
                    )

                    # Retry if under max_retries
                    if task.retry_count < task.max_retries:
                        await self._retry_task(task)
                    else:
                        await self._move_to_dead_letter(task, str(e))

                finally:
                    self._queue.task_done()

            except asyncio.TimeoutError:
                # No task available, continue loop
                continue
            except asyncio.CancelledError:
                logger.debug("Worker %d cancelled", worker_id)
                break
            except Exception as e:
                logger.error("Worker %d error: %s", worker_id, e, exc_info=True)

        logger.debug("Task queue worker %d stopped", worker_id)

    async def _retry_task(self, task: Task):
        """
        Retry a failed task with exponential backoff.

        Args:
            task: Task to retry
        """
        delay = min(2**task.retry_count, 60)  # Max 60s delay

        if delay > 0:
            await asyncio.sleep(delay)

        # Re-queue the task
        try:
            self._queue.put_nowait((task.priority.value, task))
            logger.debug(
                "Task re-queued: %s (attempt %d, delay: %.1fs)",
                task.task_id,
                task.retry_count + 1,
                delay,
            )
        except asyncio.QueueFull:
            await self._move_to_dead_letter(task, "queue full during retry")

    async def _move_to_dead_letter(self, task: Task, reason: str):
        """
        Move a failed task to the dead letter queue.

        Args:
            task: Failed task
            reason: Reason for failure
        """
        if self.dead_letter_enabled:
            self._dead_letter.append(task)
            self.stats["dead_letter_count"] += 1
            logger.error("Task moved to dead letter: %s (reason: %s)", task.task_id, reason)
        else:
            logger.warning("Task failed and not retried: %s (reason: %s)", task.task_id, reason)

    def get_stats(self) -> dict:
        """
        Get task queue statistics.

        Returns:
            Dictionary with queue statistics
        """
        return {
            **self.stats,
            "queue_size": self._queue.qsize(),
            "dead_letter_size": len(self._dead_letter),
            "worker_count": len(self._workers),
            "is_running": self._running,
        }

    async def get_queue_size(self) -> int:
        """Get current queue size."""
        return self._queue.qsize()

    async def get_dead_letter_tasks(self) -> List[Task]:
        """Get all tasks in the dead letter queue."""
        return self._dead_letter.copy()


# Global singleton task queue instance
task_queue: TaskQueue = TaskQueue()


async def start_task_queue():
    """Start the global task queue instance."""
    await task_queue.start()


async def stop_task_queue():
    """Stop the global task queue instance."""
    await task_queue.stop()


def get_task_queue() -> TaskQueue:
    """Get the global task queue instance."""
    return task_queue
