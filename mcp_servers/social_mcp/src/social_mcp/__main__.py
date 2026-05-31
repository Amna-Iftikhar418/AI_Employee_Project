"""Entry point for the Social MCP server."""
from social_mcp.server import mcp


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
