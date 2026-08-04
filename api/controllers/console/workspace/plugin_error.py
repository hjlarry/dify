"""Console-surface compatibility adapter for plugin semantic errors."""

from core.plugin.errors import PluginSemanticError
from libs.exception import BaseHTTPException


class PluginConsoleError(BaseHTTPException):
    """Preserve the current Console ``{code, message, status}`` wire shape."""

    def __init__(self, error: PluginSemanticError) -> None:
        definition = error.definition
        self.error_code = definition.code.value
        self.code = definition.default_status
        super().__init__(description=definition.default_message)
