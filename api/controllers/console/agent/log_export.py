"""Console endpoints for Agent log CSV exports."""

from datetime import datetime
from http import HTTPStatus
from typing import Literal
from uuid import UUID

from flask import Response, request
from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from controllers.common.errors import ForbiddenError, InvalidArgumentError, PaidPlanRequiredError
from controllers.common.fields import BinaryFileResponse
from controllers.common.rbac import AgentId, RBACCheck
from controllers.common.schema import query_params_from_model, register_response_schema_models, register_schema_models
from controllers.console import console_ns
from controllers.console.agent.roster import agent_log_query_values
from controllers.console.app.error import LogExportLimitReachedHTTPError, LogExportTaskNotCancelableHTTPError
from controllers.console.app.log_export_response import (
    log_export_file_response,
    log_export_status_email_preference,
    update_log_export_email_preference,
)
from controllers.console.flask_admission import console_account_admission
from controllers.console.wraps import RBACPermission, is_cloud_edition_billing_paid_plan, model_validate
from extensions.ext_application_services import application_services
from fields.base import ResponseModel
from fields.log_export_fields import (
    LogExportEmailNotificationPayload,
    LogExportEmailNotificationResponse,
    LogExportEstimatedRows,
    LogExportProgressResponse,
    LogExportTaskResponse,
)
from libs.exception import BaseHTTPException
from libs.external_api import error_responses
from libs.helper import dump_response
from libs.login import current_account_with_tenant
from machinery.context import RequestContext
from models.account import TenantAccountRole
from services.agent.errors import AgentNotFoundError
from services.agent.observability_contracts import (
    AgentLogExportFilters,
    AgentLogExportQuery,
    AgentObservabilityNotFoundError,
    normalize_agent_log_export_source,
)
from services.feature_service import FeatureService
from services.retention.agent.log_export_service import AgentLogExportTask
from services.retention.log_export_email import LogExportEmailState
from services.retention.log_export_task import (
    LogExportFileNotFoundError,
    LogExportIdentityLabel,
    LogExportKind,
    LogExportLimitReachedError,
    LogExportStatus,
    LogExportTaskNotCancelableError,
    LogExportTaskNotFoundError,
    LogExportTaskNotReadyError,
)


class AgentLogExportPreviewQuery(BaseModel):
    sources: list[str] = Field(default_factory=list, description="Source IDs from the Agent Logs filters")
    end_user_ids: list[UUID] = Field(default_factory=list, description="Include logs from these end users")
    account_ids: list[UUID] = Field(default_factory=list, description="Include logs from these workspace accounts")
    start: str | None = Field(
        default=None, description="Inclusive start time in the account timezone (YYYY-MM-DD HH:MM)"
    )
    end: str | None = Field(default=None, description="Exclusive end time in the account timezone (YYYY-MM-DD HH:MM)")

    @field_validator("sources")
    @classmethod
    def validate_source_ids(cls, sources: list[str]) -> list[str]:
        """Reject malformed structured source identifiers before querying UUID columns."""
        return [normalize_agent_log_export_source(source) for source in sources if source.strip()]

    def to_query(self) -> AgentLogExportQuery:
        """Pass validated filters and account-local date bounds to Agent log export."""
        return AgentLogExportQuery(
            sources=tuple(self.sources),
            end_user_ids=tuple(str(user_id) for user_id in self.end_user_ids),
            account_ids=tuple(str(account_id) for account_id in self.account_ids),
            start=self.start,
            end=self.end,
        )


class AgentLogExportCreatePayload(AgentLogExportPreviewQuery):
    """Submit unpaginated preview filters and their display labels for the export."""

    model_config = ConfigDict(extra="forbid")

    identity_labels: tuple[LogExportIdentityLabel, ...] = ()
    estimated_rows: LogExportEstimatedRows = None


class AgentLogExportCountsResponse(ResponseModel):
    log_count: int
    row_count: int


class AgentLogExportPreviewResponse(ResponseModel):
    counts: AgentLogExportCountsResponse | None = Field(description="Matching log and CSV row counts, null on timeout")


class AgentLogExportTaskResponse(LogExportTaskResponse):
    status: Literal["pending"]


class AgentLogExportStatusResponse(LogExportTaskResponse):
    status: LogExportStatus
    progress: LogExportProgressResponse | None = None
    email_notification: LogExportEmailState | None = Field(default=None, exclude_if=lambda value: value is None)


class AgentLogExportLatestTaskResponse(AgentLogExportStatusResponse):
    filters: AgentLogExportFilters
    identity_labels: tuple[LogExportIdentityLabel, ...] = ()
    expires_at: datetime | None = Field(default=None, description="UTC deadline for downloading the export")


class AgentLogExportLatestResponse(ResponseModel):
    task: AgentLogExportLatestTaskResponse | None = Field(
        description="Null if the caller has no live export task for this Agent"
    )


class AgentLogExportTaskNotFoundHTTPError(BaseHTTPException):
    error_code = "agent_log_export_task_not_found"
    description = "Agent log export task not found."
    code = HTTPStatus.NOT_FOUND


class AgentLogExportTaskNotReadyHTTPError(BaseHTTPException):
    error_code = "agent_log_export_task_not_ready"
    description = "The Agent log export is not ready for download."
    code = HTTPStatus.CONFLICT


class AgentLogExportFileNotFoundHTTPError(BaseHTTPException):
    error_code = "agent_log_export_file_not_found"
    description = "Agent log export file not found."
    code = HTTPStatus.NOT_FOUND


register_schema_models(console_ns, AgentLogExportCreatePayload, LogExportEmailNotificationPayload)
register_response_schema_models(
    console_ns,
    AgentLogExportPreviewResponse,
    AgentLogExportTaskResponse,
    AgentLogExportStatusResponse,
    AgentLogExportLatestResponse,
    LogExportEmailNotificationResponse,
    BinaryFileResponse,
)


def _require_agent_log_export_access(context: RequestContext) -> None:
    """Require a workspace Owner or Admin with the Cloud log export entitlement when applicable."""
    if not TenantAccountRole.is_privileged_role(current_account_with_tenant().account.role):
        raise ForbiddenError()
    if FeatureService.requires_paid_plan_for_log_export() and not is_cloud_edition_billing_paid_plan(
        context.active_workspace_id
    ):
        raise PaidPlanRequiredError()


@console_ns.route("/agent/<uuid:agent_id>/log-exports/preview")
class AgentLogExportPreviewApi(Resource):
    @error_responses(AgentNotFoundError, ForbiddenError, PaidPlanRequiredError, InvalidArgumentError)
    @console_ns.doc("preview_agent_log_export", params=query_params_from_model(AgentLogExportPreviewQuery))
    @console_ns.response(HTTPStatus.OK, "Export preview", console_ns.models[AgentLogExportPreviewResponse.__name__])
    @console_ns.response(HTTPStatus.BAD_REQUEST, "Invalid log filters")
    @console_account_admission(rbac_checks=[RBACCheck(RBACPermission.AGENT_LOG_MANAGE, AgentId())])
    def get(self, context: RequestContext, agent_id: UUID) -> dict[str, object]:
        """Return filtered export counts for the admitted Agent, workspace role, and plan."""
        _require_agent_log_export_access(context)
        try:
            query = AgentLogExportPreviewQuery.model_validate(
                {
                    "sources": agent_log_query_values("sources"),
                    "end_user_ids": agent_log_query_values("end_user_ids"),
                    "account_ids": agent_log_query_values("account_ids"),
                    "start": request.args.get("start"),
                    "end": request.args.get("end"),
                }
            )
            counts = application_services().agent_observability.count_export_logs(
                context, str(agent_id), query.to_query()
            )
        except ValidationError as exc:
            raise InvalidArgumentError(
                exc.json(include_url=False, include_input=False, include_context=False)
            ) from None
        except AgentObservabilityNotFoundError as exc:
            raise AgentNotFoundError from exc
        except ValueError as exc:
            raise InvalidArgumentError(str(exc)) from exc
        return dump_response(AgentLogExportPreviewResponse, {"counts": counts})


@console_ns.route("/agent/<uuid:agent_id>/log-exports")
class AgentLogExportApi(Resource):
    @error_responses(
        AgentNotFoundError, ForbiddenError, PaidPlanRequiredError, InvalidArgumentError, LogExportLimitReachedHTTPError
    )
    @console_ns.doc("create_agent_log_export", description="Create a pending CSV export task for the Agent")
    @console_ns.expect(console_ns.models[AgentLogExportCreatePayload.__name__])
    @console_ns.response(
        HTTPStatus.ACCEPTED, "Export task created", console_ns.models[AgentLogExportTaskResponse.__name__]
    )
    @console_ns.response(HTTPStatus.BAD_REQUEST, "Invalid log filters")
    @console_account_admission(rbac_checks=[RBACCheck(RBACPermission.AGENT_LOG_MANAGE, AgentId())])
    def post(self, context: RequestContext, agent_id: UUID) -> tuple[dict[str, object], HTTPStatus]:
        """Admit the caller and return the Agent's task ID after the normalized filters are saved."""
        _require_agent_log_export_access(context)
        try:
            payload = AgentLogExportCreatePayload.model_validate(request.get_json(silent=True))
            task = application_services().agent_log_exports.create_task(
                context,
                str(agent_id),
                payload.to_query(),
                identity_labels=payload.identity_labels,
                estimated_rows=payload.estimated_rows,
            )
        except ValidationError as exc:
            raise InvalidArgumentError(
                exc.json(include_url=False, include_input=False, include_context=False)
            ) from None
        except AgentObservabilityNotFoundError as exc:
            raise AgentNotFoundError from exc
        except LogExportLimitReachedError as exc:
            raise LogExportLimitReachedHTTPError() from exc
        except ValueError as exc:
            raise InvalidArgumentError(str(exc)) from exc
        return dump_response(AgentLogExportTaskResponse, task), HTTPStatus.ACCEPTED


@console_ns.route("/agent/<uuid:agent_id>/log-exports/latest")
class AgentLogExportLatestApi(Resource):
    @error_responses(AgentNotFoundError, ForbiddenError, PaidPlanRequiredError)
    @console_ns.doc(
        "get_latest_agent_log_export", description="Get the caller's latest Agent log export and its filters"
    )
    @console_ns.response(HTTPStatus.OK, "Latest export", console_ns.models[AgentLogExportLatestResponse.__name__])
    @console_account_admission(rbac_checks=[RBACCheck(RBACPermission.AGENT_LOG_MANAGE, AgentId())])
    def get(self, context: RequestContext, agent_id: UUID) -> tuple[dict[str, object], HTTPStatus, dict[str, str]]:
        """Return the caller's latest live task for an available Agent, or a null task."""
        _require_agent_log_export_access(context)
        try:
            task = application_services().agent_log_exports.get_latest_task(context, str(agent_id))
        except AgentObservabilityNotFoundError as exc:
            raise AgentNotFoundError from exc
        return dump_response(AgentLogExportLatestResponse, {"task": task}), HTTPStatus.OK, {"Cache-Control": "no-store"}


@console_ns.route("/agent/<uuid:agent_id>/log-exports/<uuid:task_id>")
class AgentLogExportTaskApi(Resource):
    @staticmethod
    def _get_task(context: RequestContext, agent_id: UUID, task_id: UUID) -> AgentLogExportTask:
        """Load the live export after checking the caller's access to the selected Agent."""
        _require_agent_log_export_access(context)
        try:
            return application_services().agent_log_exports.get_task(context, str(agent_id), task_id=str(task_id))
        except AgentObservabilityNotFoundError as exc:
            raise AgentNotFoundError from exc

    @error_responses(AgentNotFoundError, AgentLogExportTaskNotFoundHTTPError, ForbiddenError, PaidPlanRequiredError)
    @console_ns.doc("get_agent_log_export_status", description="Get the current status of an Agent log export task")
    @console_ns.response(HTTPStatus.OK, "Export task status", console_ns.models[AgentLogExportStatusResponse.__name__])
    @console_account_admission(rbac_checks=[RBACCheck(RBACPermission.AGENT_LOG_MANAGE, AgentId())])
    def get(
        self, context: RequestContext, agent_id: UUID, task_id: UUID
    ) -> tuple[dict[str, object], HTTPStatus, dict[str, str]]:
        """Return the state of a live task scoped to the admitted workspace and Agent."""
        try:
            task = self._get_task(context, agent_id, task_id)
        except LogExportTaskNotFoundError as exc:
            raise AgentLogExportTaskNotFoundHTTPError() from exc
        return (
            dump_response(AgentLogExportStatusResponse, task)
            | log_export_status_email_preference(task, account_id=context.account_id, export_kind=LogExportKind.AGENT),
            HTTPStatus.OK,
            {"Cache-Control": "no-store"},
        )

    @error_responses(AgentNotFoundError, AgentLogExportTaskNotFoundHTTPError, ForbiddenError, PaidPlanRequiredError)
    @console_ns.doc("set_agent_log_export_email_notification")
    @console_ns.doc(description="Set the requester's email preference for this Agent CSV export")
    @console_ns.expect(console_ns.models[LogExportEmailNotificationPayload.__name__])
    @console_ns.response(
        HTTPStatus.OK, "Email notification preference", console_ns.models[LogExportEmailNotificationResponse.__name__]
    )
    @console_account_admission(rbac_checks=[RBACCheck(RBACPermission.AGENT_LOG_MANAGE, AgentId())])
    @model_validate(LogExportEmailNotificationPayload)
    def put(
        self, payload: LogExportEmailNotificationPayload, context: RequestContext, agent_id: UUID, task_id: UUID
    ) -> tuple[dict[str, object], HTTPStatus, dict[str, str]]:
        """Update the caller's preference for a live export of the Agent's logs."""
        try:
            task = self._get_task(context, agent_id, task_id)
            return update_log_export_email_preference(
                task, account_id=context.account_id, export_kind=LogExportKind.AGENT, enabled=payload.enabled
            )
        except LogExportTaskNotFoundError as exc:
            raise AgentLogExportTaskNotFoundHTTPError() from exc


@console_ns.route("/agent/<uuid:agent_id>/log-exports/<uuid:task_id>/cancel")
class AgentLogExportCancelApi(Resource):
    @error_responses(
        AgentNotFoundError,
        AgentLogExportTaskNotFoundHTTPError,
        LogExportTaskNotCancelableHTTPError,
        ForbiddenError,
        PaidPlanRequiredError,
    )
    @console_ns.doc("cancel_agent_log_export", description="Cancel a queued Agent CSV export task")
    @console_ns.response(HTTPStatus.OK, "Export canceled", console_ns.models[AgentLogExportStatusResponse.__name__])
    @console_account_admission(rbac_checks=[RBACCheck(RBACPermission.AGENT_LOG_MANAGE, AgentId())])
    def post(
        self, context: RequestContext, agent_id: UUID, task_id: UUID
    ) -> tuple[dict[str, object], HTTPStatus, dict[str, str]]:
        """Cancel the admitted requester's queued Agent task and return its new status."""
        _require_agent_log_export_access(context)
        try:
            task = application_services().agent_log_exports.cancel_task(context, str(agent_id), task_id=str(task_id))
        except AgentObservabilityNotFoundError as exc:
            raise AgentNotFoundError from exc
        except LogExportTaskNotFoundError as exc:
            raise AgentLogExportTaskNotFoundHTTPError() from exc
        except LogExportTaskNotCancelableError as exc:
            raise LogExportTaskNotCancelableHTTPError() from exc
        return dump_response(AgentLogExportStatusResponse, task), HTTPStatus.OK, {"Cache-Control": "no-store"}


@console_ns.route("/agent/<uuid:agent_id>/log-exports/<uuid:task_id>/file")
class AgentLogExportFileApi(Resource):
    @error_responses(
        AgentNotFoundError,
        AgentLogExportTaskNotFoundHTTPError,
        AgentLogExportTaskNotReadyHTTPError,
        AgentLogExportFileNotFoundHTTPError,
        ForbiddenError,
        PaidPlanRequiredError,
    )
    @console_ns.doc("download_agent_log_export")
    @console_ns.doc(description="Download a completed Agent log CSV from object storage or the Console API")
    @console_ns.doc(params={"agent_id": "Agent ID", "task_id": "Export task ID"})
    @console_ns.produces(["text/csv"])
    @console_ns.response(HTTPStatus.OK, "CSV attachment", console_ns.models[BinaryFileResponse.__name__])
    @console_ns.response(
        HTTPStatus.FOUND,
        "Redirect to a pre-signed CSV download URL",
        headers={"Location": {"description": "Pre-signed object storage URL", "type": "string"}},
    )
    @console_account_admission(rbac_checks=[RBACCheck(RBACPermission.AGENT_LOG_MANAGE, AgentId())])
    def get(self, context: RequestContext, agent_id: UUID, task_id: UUID) -> Response:
        """Authorize the Agent and its ready export before redirecting or streaming the CSV."""
        _require_agent_log_export_access(context)
        filename = f"agent-logs-{task_id}.csv"
        try:
            download = application_services().agent_log_exports.download_csv(
                context, str(agent_id), task_id=str(task_id), filename=filename
            )
        except AgentObservabilityNotFoundError as exc:
            raise AgentNotFoundError from exc
        except LogExportTaskNotFoundError as exc:
            raise AgentLogExportTaskNotFoundHTTPError() from exc
        except LogExportTaskNotReadyError as exc:
            raise AgentLogExportTaskNotReadyHTTPError() from exc
        except LogExportFileNotFoundError as exc:
            raise AgentLogExportFileNotFoundHTTPError() from exc
        # response-contract:ignore signed redirect or streamed CSV attachment
        return log_export_file_response(download, filename=filename)
