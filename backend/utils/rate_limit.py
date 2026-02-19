from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
import time


class InMemorySlidingWindowLimiter:
    """
    Per-key rate limiter used for authenticated user chat requests.
    For horizontal scaling, replace this with Redis.
    """

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> tuple[bool, int]:
        now = time.time()
        with self._lock:
            q = self._events[key]
            while q and now - q[0] > self.window_seconds:
                q.popleft()

            if len(q) >= self.max_requests:
                retry_after = int(self.window_seconds - (now - q[0])) + 1
                return False, max(retry_after, 1)

            q.append(now)
            return True, 0
