"""Shared Anthropic clients — one sync, one async.

Every call site in the app imports from here instead of
instantiating its own client. Reduces connection overhead
and ensures consistent configuration.
"""

from anthropic import Anthropic, AsyncAnthropic

sync_client = Anthropic()
async_client = AsyncAnthropic()
