"""Plugin-owned semantic error definitions.

This module is deliberately scoped to the plugin domain. Transport adapters
may read these definitions, but their wire shape is owned by each surface.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PluginErrorCode(StrEnum):
    PACKAGE_TOO_LARGE = "plugin_package_too_large"


class PluginErrorPhase(StrEnum):
    INSTALL = "install"


class PluginErrorCategory(StrEnum):
    VALIDATION = "validation"


class PluginErrorRetryability(StrEnum):
    AFTER_CHANGE = "after_change"


class PluginErrorUserAction(StrEnum):
    """Stable action intent for governance and frontend catalog alignment.

    Surface adapters must not serialize this as a UI button. The owning
    frontend feature decides whether and how to render an action.
    """

    REPACKAGE_PLUGIN = "repackage_plugin"


class PluginErrorDetail(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: str


class FileConstraintDetail(PluginErrorDetail):
    type: Literal["file_constraint"] = "file_constraint"
    media_kind: Literal["plugin_package"] = "plugin_package"
    actual_size_bytes: int = Field(ge=0)
    max_size_bytes: int = Field(ge=0)


@dataclass(frozen=True, slots=True)
class PluginErrorDefinition:
    domain: Literal["plugin"]
    phase: PluginErrorPhase
    code: PluginErrorCode
    category: PluginErrorCategory
    default_status: int
    default_message: str
    retryability: PluginErrorRetryability
    user_action: PluginErrorUserAction
    allowed_detail_types: tuple[type[PluginErrorDetail], ...]
    owner: str


PLUGIN_ERROR_DEFINITIONS: Mapping[PluginErrorCode, PluginErrorDefinition] = MappingProxyType(
    {
        PluginErrorCode.PACKAGE_TOO_LARGE: PluginErrorDefinition(
            domain="plugin",
            phase=PluginErrorPhase.INSTALL,
            code=PluginErrorCode.PACKAGE_TOO_LARGE,
            category=PluginErrorCategory.VALIDATION,
            default_status=413,
            default_message="The plugin package exceeds the maximum allowed size.",
            retryability=PluginErrorRetryability.AFTER_CHANGE,
            user_action=PluginErrorUserAction.REPACKAGE_PLUGIN,
            allowed_detail_types=(FileConstraintDetail,),
            owner="plugin",
        ),
    }
)


class PluginSemanticError(Exception):
    """A plugin failure with stable product semantics and typed safe details."""

    definition: PluginErrorDefinition
    details: tuple[PluginErrorDetail, ...]

    def __init__(self, code: PluginErrorCode, *, details: Sequence[PluginErrorDetail] = ()) -> None:
        self.definition = PLUGIN_ERROR_DEFINITIONS[code]
        self.details = tuple(details)
        unsupported_types = {
            type(detail).__name__ for detail in self.details if type(detail) not in self.definition.allowed_detail_types
        }
        if unsupported_types:
            unsupported = ", ".join(sorted(unsupported_types))
            raise ValueError(f"Detail types are not registered for {code}: {unsupported}")

        super().__init__(self.definition.default_message)


class PluginUploadContentTooLargeError(ValueError):
    """Technical upload-boundary failure before product semantics are selected."""

    def __init__(self, *, actual_size_bytes: int, max_size_bytes: int) -> None:
        self.actual_size_bytes = actual_size_bytes
        self.max_size_bytes = max_size_bytes
        super().__init__("File size exceeds the maximum allowed size")


def map_plugin_package_upload_error(error: PluginUploadContentTooLargeError) -> PluginSemanticError:
    """Map a known package-upload failure to the registered semantic error."""

    return PluginSemanticError(
        PluginErrorCode.PACKAGE_TOO_LARGE,
        details=(
            FileConstraintDetail(
                actual_size_bytes=error.actual_size_bytes,
                max_size_bytes=error.max_size_bytes,
            ),
        ),
    )
