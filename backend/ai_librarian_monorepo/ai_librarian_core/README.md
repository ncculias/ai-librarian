# ai-librarian-core

`ai-librarian-core` is a Python package designed to streamline the development of AI agents. It provides a comprehensive wrapper around LangChain and LangGraph, offering seamless integration with essential functionalities such as multi-hop tool use, memory management, and real-time streaming capabilities.

## Key Features

*   **Multi-hop Tool Use**: Enables agents to call multiple tools in sequence to generate comprehensive responses.
*   **Streaming Support**: Delivers real-time token streaming for immediate agent responses.
*   **Memory Management**: Implements conversational memory systems for stateful and context-aware AI interactions.

## Built-in Tools

The following tools are readily available within `ai-librarian-core`:

*   **Google Books**: Search for books and publications on Google Books.
*   **Google Search**: Perform web searches using Google.
*   **YouTube Search**: Search for videos on YouTube.
*   **Date Time**: Retrieve the current date and time.
*   **arXiv Search**: Search for academic papers and preprints on arXiv.
*   **DuckDuckGo Search**: Conduct web searches using DuckDuckGo.
*   **Wikipedia Search**: Access information from Wikipedia.
*   **OpenWeatherMap**: Obtain current weather data for specified locations.
*   **NCL Crawler**: A specialized web crawler for the National Central Library of Taiwan (國家圖書館).

## Installation

To set up the `ai-librarian-core` package, follow these steps:

1.  **Clone the Repository:**

    ```bash
    git clone https://github.com/youkwan/ai-librarian.git
    cd ai-librarian/backend/ai_librarian_monorepo/ai_librarian_core/
    ```

2.  **Install uv:**
    This project leverages [uv](https://github.com/astral-sh/uv) for efficient virtual environment and dependency management. If you do not have `uv` installed, please follow the [official installation guide](https://docs.astral.sh/uv/getting-started/installation/).

3.  **Install Playwright Browsers (Optional):**
    If you intend to use the `NCL Crawler` tool, you must install the necessary browser binaries for Playwright:

    ```bash
    playwright install
    ```

4.  **Install Package Dependencies:**
    Navigate to the `ai_librarian_core` directory and install all required dependencies:

    ```bash
    uv sync
    ```

## Usage

### Environment Variables

Certain tools require API keys or specific IDs to function correctly. Set the following environment variables as needed:

*   `OPENAI_API_KEY`: Required for OpenAI models.
*   `GOOGLE_API_KEY`: Required for Google Books and Google Search.
*   `GOOGLE_CSE_ID`: Required for Google Search.
*   `OPENWEATHERMAP_API_KEY`: Required for the OpenWeatherMap tool.

### Initializing Tools

The `get_built_in_tools()` function automatically initializes and loads all available built-in tools based on the configured environment variables.

```python
import os
from langchain_core.tools import BaseTool
from ai_librarian_core.tools.tools import get_built_in_tools

# Example: Set environment variables (replace with your actual keys)
os.environ["OPENAI_API_KEY"] = "your_openai_api_key"
os.environ["GOOGLE_API_KEY"] = "your_google_api_key"
os.environ["GOOGLE_CSE_ID"] = "your_google_cse_id"
os.environ["OPENWEATHERMAP_API_KEY"] = "your_openweathermap_api_key"

tools: list[BaseTool] = get_built_in_tools()
# tools will contain initialized instances of BaseTool subclasses
```

Tools are based on `langchain_core.tools.BaseTool`. You can implement custom tools by subclassing `BaseTool` and appending them to the `tools` list. Tools can be directly invoked using their `invoke()` or `ainvoke()` methods.

```python
from langchain_core.tools import BaseTool
from ai_librarian_core.tools.date_time import DateTimeTool
from ai_librarian_core.tools.tools import get_built_in_tools

# Initialize tools
tools: list[BaseTool] = get_built_in_tools()

# Example: Directly invoking the DateTimeTool
date_time_tool = DateTimeTool()
result = date_time_tool.invoke({})
print(result)
```

**Expected Output:**

```plaintext
The current time is YYYY-MM-DDTHH:MM:SS.SSSSSS+ZZ:ZZ (actual time will vary)
```

### Invoking a `ReactAgent` (Synchronous)

The `ReactAgent` class provides a synchronous interface for invoking the agent and processing its output.

```python
import os
from langchain_core.messages import HumanMessage, SystemMessage
from rich.pretty import pprint
from ai_librarian_core.agents.react.synchronous import ReactAgent
from ai_librarian_core.models.llm_config import LLMConfig
from ai_librarian_core.tools.tools import get_built_in_tools

# Set environment variables (replace with your actual keys)
os.environ["OPENAI_API_KEY"] = "your_openai_api_key"
os.environ["GOOGLE_API_KEY"] = "your_google_api_key"
os.environ["GOOGLE_CSE_ID"] = "your_google_cse_key"

# Initialize tools
tools = get_built_in_tools()

# Create and run the ReactAgent
react_agent = ReactAgent(tools=tools)
messages, used_tools = react_agent.run(
    messages=[
        SystemMessage(content="You are a helpful assistant."),
        HumanMessage(
            content="I'm learning how to build AI agents. Could you help me find online tutorials and some educational videos?"
        ),
    ],
    thread_id="test-1234567890",
    llm_config=LLMConfig(model="openai:gpt-4o-mini", temperature=1.0, max_tokens=1000),
)

pprint(messages)
pprint(used_tools)
```

### Streaming from a `ReactAgent` (Synchronous)

The `ReactAgent` also supports real-time streaming of responses.

```python
import os
from ai_librarian_core.agents.react.synchronous import ReactAgent
from ai_librarian_core.models.llm_config import LLMConfig
from ai_librarian_core.tools.tools import get_built_in_tools
from langchain_core.messages import HumanMessage, SystemMessage
from rich.pretty import pprint

# Set environment variables (replace with your actual keys)
os.environ["OPENAI_API_KEY"] = "your_openai_api_key"
os.environ["GOOGLE_API_KEY"] = "your_google_api_key"
os.environ["GOOGLE_CSE_ID"] = "your_google_cse_key"

# Initialize tools
tools = get_built_in_tools()

# Create and stream from the ReactAgent
agent = ReactAgent(tools=tools)
result = agent.stream(
    [
        SystemMessage(content="You are a helpful assistant."),
        HumanMessage(
            content="I'm learning how to build AI agents. Could you help me find online tutorials and some educational videos?"
        ),
    ],
    thread_id="test-1234567890",
    llm_config=LLMConfig(model="openai:gpt-4o-mini", temperature=1.0, max_tokens=1000),
)

for chunk in result:
    pprint(chunk)
```

### Invoking an `AsyncReactAgent` (Asynchronous)

For asynchronous operations, use the `AsyncReactAgent` class.

```python
import asyncio
import os
from ai_librarian_core.agents.react.asynchronous import AsyncReactAgent
from langchain_core.messages import HumanMessage, SystemMessage
from rich.pretty import pprint
from ai_librarian_core.models.llm_config import LLMConfig
from ai_librarian_core.tools.tools import get_built_in_tools

# Set environment variables (replace with your actual keys)
os.environ["OPENAI_API_KEY"] = "your_openai_api_key"
os.environ["GOOGLE_API_KEY"] = "your_google_api_key"
os.environ["GOOGLE_CSE_ID"] = "your_google_cse_key"

# Initialize tools
tools = get_built_in_tools()

# Create and run the AsyncReactAgent
agent = AsyncReactAgent(tools=tools)
async def run_async_agent():
    messages, used_tools = await agent.run(
        [
            SystemMessage(content="You are a helpful assistant."),
            HumanMessage(
                content="I'm learning how to build AI agents. Could you help me find online tutorials and some educational videos?"
            ),
        ],
        thread_id="test-1234567890",
        llm_config=LLMConfig(model="openai:gpt-4o-mini", temperature=1.0, max_tokens=1000),
    )
    pprint(messages)
    pprint(used_tools)

asyncio.run(run_async_agent())
```

### Streaming from an `AsyncReactAgent` (Asynchronous)

Asynchronous streaming for real-time response generation.

```python
import asyncio
import os
from ai_librarian_core.agents.react.asynchronous import AsyncReactAgent
from ai_librarian_core.models.llm_config import LLMConfig
from ai_librarian_core.tools.tools import get_built_in_tools
from langchain_core.messages import HumanMessage, SystemMessage
from rich.pretty import pprint

# Set environment variables (replace with your actual keys)
os.environ["OPENAI_API_KEY"] = "your_openai_api_key"
os.environ["GOOGLE_API_KEY"] = "your_google_api_key"
os.environ["GOOGLE_CSE_ID"] = "your_google_cse_key"

# Initialize tools
tools = get_built_in_tools()

# Create and stream from the AsyncReactAgent
agent = AsyncReactAgent(tools=tools)
async def stream_async_agent():
    result = await agent.stream(
        [
            SystemMessage(content="You are a helpful assistant."),
            HumanMessage(
                content="I'm learning how to build AI agents. Could you help me find online tutorials and some educational videos?"
            )
        ],
        thread_id="test-1234567890",
        llm_config=LLMConfig(model="openai:gpt-4o-mini", temperature=1.0, max_tokens=1000),
    )
    async for chunk in result:
        pprint(chunk)

asyncio.run(stream_async_agent())
```

## 情緒判斷評估

標註準則見 `docs/superpowers/specs/2026-10-23-emotion-detection-v2-design.md` §3。評估集為 `tests/data/emotion_eval.jsonl`（36 筆使用者句子，每個標籤 6 筆）。

```bash
cd backend && uv run python scripts/eval_emotion.py --show-errors
```

需要環境變數 `OPENAI_API_KEY`（可放在 `ai_librarian_monorepo/ai_librarian_apis/.env`）；`EMOTION_MODEL` 為選用，也可用 `--model` 覆寫。其他參數：`--limit N`、`--data PATH`。

**v2 基準**（2026-10-23，`openai:gpt-5.4-mini`）：準確率 36/36 = 100%。這組樣本偏容易，適合當回歸煙霧測試；要比較提示詞改動，請再加入多情緒混合（規則 3）與客氣但不開心（規則 4）的難例。

`EMOTION_MODEL` 在匯入時讀取，因此只有 shell 匯出或 `--model` 會生效，寫在 `.env` 裡不會改變預設模型。

```text
             neutral     happy       sad     angry surprised     think
neutral            6         0         0         0         0         0
happy              0         6         0         0         0         0
sad                0         0         6         0         0         0
angry              0         0         0         6         0         0
surprised          0         0         0         0         6         0
think              0         0         0         0         0         6
```

## TODO
1. Extend `AsyncReactAgent` or create a new agent with additional Live2D control signals.
2. Simplify the import paths of this package (write proper init file).
3. Remove the `playwright` dependency.
4. Implement database for storing conversation history.
6. Implement tool for searching resources on the National Library of Public Information (國立公共資訊圖書館).
7. Implement Deep search agent.
8. Implement MCP support.