class Structured:
    """Stub for the runnable returned by with_structured_output."""

    def __init__(self, result):  # noqa: D107
        self.result = result
        self.calls = 0

    async def ainvoke(self, _prompt):
        self.calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class FakeLLM:
    """Stub chat model whose structured output returns (or raises) `result`."""

    def __init__(self, result):  # noqa: D107
        self.structured = Structured(result)

    def with_structured_output(self, _schema):
        return self.structured
