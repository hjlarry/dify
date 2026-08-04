from controllers.console.workspace.plugin_error import PluginConsoleError
from core.plugin.errors import FileConstraintDetail, PluginErrorCode, PluginSemanticError


def test_plugin_console_error_keeps_legacy_wire_shape() -> None:
    semantic_error = PluginSemanticError(
        PluginErrorCode.PACKAGE_TOO_LARGE,
        details=(FileConstraintDetail(actual_size_bytes=2, max_size_bytes=1),),
    )

    error = PluginConsoleError(semantic_error)

    assert error.data == {
        "code": "plugin_package_too_large",
        "message": "The plugin package exceeds the maximum allowed size.",
        "status": 413,
    }
    assert "details" not in error.data
    assert "user_action" not in error.data
