"""Shared scope and filters for Workflow log queries and exports."""

from dataclasses import dataclass
from datetime import datetime

from graphon.enums import WorkflowExecutionStatus


@dataclass(frozen=True, slots=True)
class WorkflowLogScope:
    """A resolved Workflow app and its owning workspace."""

    tenant_id: str
    app_id: str


@dataclass(frozen=True, slots=True)
class WorkflowLogExportFilters:
    """Filter published runs by their Logs entries, with time bounds in naive UTC."""

    keyword: str | None = None
    status: WorkflowExecutionStatus | None = None
    created_at_before: datetime | None = None
    created_at_after: datetime | None = None
    end_user_ids: tuple[str, ...] = ()
    account_ids: tuple[str, ...] = ()
