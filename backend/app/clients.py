"""Shared Anthropic clients — one sync, one async.

Every call site in the app imports from here instead of
instantiating its own client. Reduces connection overhead
and ensures consistent configuration.

Clients are created lazily on first access so that python-dotenv
has time to load ANTHROPIC_API_KEY before instantiation.
"""

from anthropic import Anthropic, AsyncAnthropic

_sync_client: Anthropic | None = None
_async_client: AsyncAnthropic | None = None


def __getattr__(name: str):
    global _sync_client, _async_client
    if name == "sync_client":
        if _sync_client is None:
            _sync_client = Anthropic()
        return _sync_client
    if name == "async_client":
        if _async_client is None:
            _async_client = AsyncAnthropic()
        return _async_client
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
