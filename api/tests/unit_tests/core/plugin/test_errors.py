import pytest

from core.plugin.errors import (
    PLUGIN_ERROR_DEFINITIONS,
    FileConstraintDetail,
    PluginErrorCategory,
    PluginErrorCode,
    PluginErrorDetail,
    PluginErrorPhase,
    PluginErrorRetryability,
    PluginErrorUserAction,
    PluginSemanticError,
    PluginUploadContentTooLargeError,
    map_plugin_package_upload_error,
)


def test_plugin_package_too_large_definition_is_registered() -> None:
    definition = PLUGIN_ERROR_DEFINITIONS[PluginErrorCode.PACKAGE_TOO_LARGE]

    assert definition.domain == "plugin"
    assert definition.phase is PluginErrorPhase.INSTALL
    assert definition.category is PluginErrorCategory.VALIDATION
    assert definition.default_status == 413
    assert definition.retryability is PluginErrorRetryability.AFTER_CHANGE
    assert definition.user_action is PluginErrorUserAction.REPACKAGE_PLUGIN
    assert definition.allowed_detail_types == (FileConstraintDetail,)
    assert definition.owner == "plugin"


def test_plugin_semantic_error_accepts_registered_detail() -> None:
    detail = FileConstraintDetail(actual_size_bytes=2, max_size_bytes=1)

    error = PluginSemanticError(PluginErrorCode.PACKAGE_TOO_LARGE, details=(detail,))

    assert error.definition is PLUGIN_ERROR_DEFINITIONS[PluginErrorCode.PACKAGE_TOO_LARGE]
    assert error.details == (detail,)
    assert str(error) == error.definition.default_message


def test_plugin_semantic_error_rejects_unregistered_detail() -> None:
    detail = PluginErrorDetail(type="unregistered")

    with pytest.raises(ValueError, match="PluginErrorDetail"):
        PluginSemanticError(PluginErrorCode.PACKAGE_TOO_LARGE, details=(detail,))


def test_package_upload_error_maps_to_registered_semantic_error() -> None:
    source_error = PluginUploadContentTooLargeError(actual_size_bytes=2, max_size_bytes=1)

    error = map_plugin_package_upload_error(source_error)

    assert error.definition is PLUGIN_ERROR_DEFINITIONS[PluginErrorCode.PACKAGE_TOO_LARGE]
    assert error.details == (FileConstraintDetail(actual_size_bytes=2, max_size_bytes=1),)
