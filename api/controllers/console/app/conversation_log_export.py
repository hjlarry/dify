"""Console endpoints for Conversation log CSV exports."""

from datetime import datetime
from http import HTTPStatus
from typing import Literal
from uuid import UUID

from flask import Response, request
from flask_restx import Resource
from pydantic import ConfigDict, Field, ValidationError

from controllers.common.errors import ForbiddenError, InvalidArgumentError, PaidPlanRequiredError, UnauthorizedError
from controllers.common.fields import BinaryFileResponse
from controllers.common.rbac import PlainApp, RBACCheck
from controllers.common.schema import query_params_from_model, register_response_schema_models, register_schema_models
from controllers.console import console_ns
from controllers.console.app.conversation import (
    ChatConversationFilterQuery,
    _ConversationLogValidationError,
    _parse_log_time_range,
    _validate_log_query,
)
from controllers.console.app.error import (
    AppNotFoundError,
    ConversationLogExportFileNotFoundHTTPError,
    ConversationLogExportTaskNotFoundHTTPError,
    ConversationLogExportTaskNotReadyHTTPError,
    LogExportLimitReachedHTTPError,
    LogExportTaskNotCancelableHTTPError,
)
from controllers.console.app.log_export_response import (
    log_export_file_response,
    log_export_status_email_preference,
    update_log_export_email_preference,
)
from controllers.console.flask_admission import console_account_admission
from controllers.console.wraps import RBACPermission, is_cloud_edition_billing_paid_plan, model_validate
from enums.account import TenantAccountRole
from extensions.ext_application_services import application_services
from fields.base import ResponseModel
from fields.log_export_fields import (
    LogExportEmailNotificationPayload,
    LogExportEmailNotificationResponse,
    LogExportEstimatedRows,
    LogExportProgressResponse,
    LogExportTaskResponse,
)
from libs.external_api import error_responses
from libs.helper import dump_response
from libs.login import current_account_with_tenant
from machinery.context import RequestContext
from services.app.console_service import ConsoleAppNotFoundError
from services.entities.conversation_entities import (
    ConsoleConversationLogFilters,
    ConsoleConversationScope,
    ConversationAnnotationStatus,
    ConversationSort,
)
from services.errors.base import NoPermissionError
from services.feature_service import FeatureService
from services.retention.log_export_email import LogExportEmailState
from services.retention.log_export_task import (
    ConversationLogExportStatus,
    ConversationLogExportTask,
    LogExportFileNotFoundError,
    LogExportIdentityLabel,
    LogExportKind,
    LogExportLimitReachedError,
    LogExportTaskNotCancelableError,
    LogExportTaskNotFoundError,
    LogExportTaskNotReadyError,
)


class ConversationLogExportPreviewQuery(ChatConversationFilterQuery):
    model_config = ConfigDict(extra="forbid")


class ConversationLogExportCreatePayload(ChatConversationFilterQuery):
    model_config = ConfigDict(extra="forbid")

    identity_labels: tuple[LogExportIdentityLabel, ...] = ()
    estimated_rows: LogExportEstimatedRows = None


class ConversationLogExportCountsResponse(ResponseModel):
    conversation_count: int = Field(ge=0)
    message_count: int = Field(ge=0, description="CSV data rows across all matched conversations")


class ConversationLogExportPreviewResponse(ResponseModel):
    counts: ConversationLogExportCountsResponse | None = Field(description="Null if the count query timed out")


class ConversationLogExportTaskResponse(LogExportTaskResponse):
    status: Literal["pending"]


class ConversationLogExportStatusResponse(LogExportTaskResponse):
    status: ConversationLogExportStatus
    progress: LogExportProgressResponse | None = None
    email_notification: LogExportEmailState | None = Field(default=None, exclude_if=lambda value: value is None)


class ConversationLogExportFiltersResponse(ResponseModel):
    """Submitted filters for the export, with any date bounds in UTC."""

    keyword: str | None
    start: datetime | None
    end: datetime | None
    annotation_status: ConversationAnnotationStatus
    sort_by: ConversationSort
    end_user_ids: tuple[str, ...]
    account_ids: tuple[str, ...]


class ConversationLogExportLatestTaskResponse(ConversationLogExportStatusResponse):
    filters: ConversationLogExportFiltersResponse
    identity_labels: tuple[LogExportIdentityLabel, ...] = ()
    expires_at: datetime | None = Field(default=None, description="UTC deadline for downloading the export")


class ConversationLogExportLatestResponse(ResponseModel):
    task: ConversationLogExportLatestTaskResponse | None = Field(
        description="Null if the caller has no live export task"
    )


def _log_export_filters(query: ChatConversationFilterQuery, timezone: str) -> ConsoleConversationLogFilters:
    """Convert validated Logs input into normalized, unpaginated filters."""
    start, end = _parse_log_time_range(query, timezone)
    return ConsoleConversationLogFilters(
        keyword=query.keyword,
        start=start,
        end=end,
        annotation_status=query.annotation_status,
        sort_by=query.sort_by,
        end_user_ids=tuple(str(user_id) for user_id in query.end_user_ids),
        account_ids=tuple(str(account_id) for account_id in query.account_ids),
    )


def _resolve_log_export_scope(request_context: RequestContext, app_id: UUID) -> ConsoleConversationScope:
    """Require Logs admission, privileged workspace role, an owned app and its export entitlement."""
    # Export requires a privileged workspace role even when RBAC is enabled.
    if not TenantAccountRole.is_privileged_role(current_account_with_tenant().account.role):
        raise ForbiddenError()

    try:
        scope = application_services().conversation_queries.get_log_export_scope(request_context, str(app_id))
    except ConsoleAppNotFoundError as exc:
        raise AppNotFoundError(str(exc)) from exc
    except NoPermissionError as exc:
        raise UnauthorizedError(str(exc)) from exc

    if FeatureService.requires_paid_plan_for_log_export() and not is_cloud_edition_billing_paid_plan(scope.tenant_id):
        raise PaidPlanRequiredError()
    return scope


register_schema_models(console_ns, ConversationLogExportCreatePayload, LogExportEmailNotificationPayload)
register_response_schema_models(
    console_ns,
    ConversationLogExportPreviewResponse,
    ConversationLogExportTaskResponse,
    ConversationLogExportStatusResponse,
    ConversationLogExportLatestResponse,
    LogExportEmailNotificationResponse,
    BinaryFileResponse,
)


@console_ns.route("/apps/<uuid:app_id>/conversation-log-exports/preview")
class ConversationLogExportPreviewApi(Resource):
    @error_responses(AppNotFoundError, ForbiddenError, PaidPlanRequiredError, _ConversationLogValidationError)
    @console_ns.doc("preview_conversation_log_export")
    @console_ns.doc(description="Count the conversations and rows that match the application's Logs filters")
    @console_ns.doc(params={"app_id": "Application ID", **query_params_from_model(ConversationLogExportPreviewQuery)})
    @console_ns.response(
        HTTPStatus.OK, "Export preview", console_ns.models[ConversationLogExportPreviewResponse.__name__]
    )
    @console_account_admission(rbac_checks=(RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp()),))
    def get(self, request_context: RequestContext, app_id: UUID) -> dict[str, object]:
        """Preview a conversation log export for a workspace Owner or Admin with application Logs access."""
        scope = _resolve_log_export_scope(request_context, app_id)
        query = _validate_log_query(ConversationLogExportPreviewQuery)
        try:
            counts = application_services().conversation_queries.get_console_log_export_counts(
                scope=scope, filters=_log_export_filters(query, scope.timezone)
            )
        except ConsoleAppNotFoundError as exc:
            raise AppNotFoundError(str(exc)) from exc
        return dump_response(ConversationLogExportPreviewResponse, {"counts": counts})


@console_ns.route("/apps/<uuid:app_id>/conversation-log-exports")
class ConversationLogExportApi(Resource):
    @error_responses(
        AppNotFoundError,
        ForbiddenError,
        InvalidArgumentError,
        LogExportLimitReachedHTTPError,
        PaidPlanRequiredError,
        UnauthorizedError,
        _ConversationLogValidationError,
    )
    @console_ns.doc("create_conversation_log_export")
    @console_ns.doc(description="Create a pending CSV export task for one conversation app")
    @console_ns.doc(params={"app_id": "Application ID"})
    @console_ns.expect(console_ns.models[ConversationLogExportCreatePayload.__name__])
    @console_ns.response(
        HTTPStatus.ACCEPTED, "Export task accepted", console_ns.models[ConversationLogExportTaskResponse.__name__]
    )
    @console_account_admission(rbac_checks=(RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp()),))
    def post(self, request_context: RequestContext, app_id: UUID) -> tuple[dict[str, object], HTTPStatus]:
        """Validate an admitted app's export filters and acknowledge the task after publication."""
        scope = _resolve_log_export_scope(request_context, app_id)
        try:
            payload = ConversationLogExportCreatePayload.model_validate(request.get_json(silent=True))
        except ValidationError as exc:
            raise _ConversationLogValidationError(
                exc.json(include_url=False, include_input=False, include_context=False)
            ) from None
        filters = _log_export_filters(payload, scope.timezone)
        try:
            task = application_services().conversation_log_exports.create_task(
                tenant_id=scope.tenant_id,
                app_id=scope.app_id,
                requested_by=request_context.account_id,
                filters=filters,
                identity_labels=payload.identity_labels,
                estimated_rows=payload.estimated_rows,
            )
        except LogExportLimitReachedError as exc:
            raise LogExportLimitReachedHTTPError() from exc
        return dump_response(ConversationLogExportTaskResponse, task), HTTPStatus.ACCEPTED


@console_ns.route("/apps/<uuid:app_id>/conversation-log-exports/latest")
class ConversationLogExportLatestApi(Resource):
    @error_responses(AppNotFoundError, ForbiddenError, PaidPlanRequiredError)
    @console_ns.doc("get_latest_conversation_log_export")
    @console_ns.doc(description="Read the caller's latest live CSV export and its submitted filters for this app")
    @console_ns.doc(params={"app_id": "Application ID"})
    @console_ns.response(
        HTTPStatus.OK, "Latest export", console_ns.models[ConversationLogExportLatestResponse.__name__]
    )
    @console_account_admission(rbac_checks=(RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp()),))
    def get(
        self, request_context: RequestContext, app_id: UUID
    ) -> tuple[dict[str, object], HTTPStatus, dict[str, str]]:
        """Return only the admitted account's latest task, or null if it is missing or expired."""
        scope = _resolve_log_export_scope(request_context, app_id)
        task = application_services().conversation_log_exports.get_latest_task(
            tenant_id=scope.tenant_id, app_id=scope.app_id, requested_by=request_context.account_id
        )
        return (
            dump_response(ConversationLogExportLatestResponse, {"task": task}),
            HTTPStatus.OK,
            {"Cache-Control": "no-store"},
        )


@console_ns.route("/apps/<uuid:app_id>/conversation-log-exports/<uuid:task_id>")
class ConversationLogExportTaskApi(Resource):
    @staticmethod
    def _get_task(request_context: RequestContext, app_id: UUID, task_id: UUID) -> ConversationLogExportTask:
        """Load the export in the caller's admitted app scope."""
        scope = _resolve_log_export_scope(request_context, app_id)
        return application_services().conversation_log_exports.get_task(
            tenant_id=scope.tenant_id, app_id=scope.app_id, task_id=str(task_id)
        )

    @error_responses(
        AppNotFoundError, ConversationLogExportTaskNotFoundHTTPError, ForbiddenError, PaidPlanRequiredError
    )
    @console_ns.doc("get_conversation_log_export_status")
    @console_ns.doc(description="Get the current status of the application's CSV export task")
    @console_ns.doc(params={"app_id": "Application ID", "task_id": "Export task ID"})
    @console_ns.response(
        HTTPStatus.OK, "Export task status", console_ns.models[ConversationLogExportStatusResponse.__name__]
    )
    @console_account_admission(rbac_checks=(RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp()),))
    def get(
        self, request_context: RequestContext, app_id: UUID, task_id: UUID
    ) -> tuple[dict[str, object], HTTPStatus, dict[str, str]]:
        """Return the state of a live export task for an admitted app."""
        try:
            task = self._get_task(request_context, app_id, task_id)
        except LogExportTaskNotFoundError as exc:
            raise ConversationLogExportTaskNotFoundHTTPError() from exc
        return (
            dump_response(ConversationLogExportStatusResponse, task)
            | log_export_status_email_preference(
                task, account_id=request_context.account_id, export_kind=LogExportKind.CONVERSATION
            ),
            HTTPStatus.OK,
            {"Cache-Control": "no-store"},
        )

    @error_responses(
        AppNotFoundError, ConversationLogExportTaskNotFoundHTTPError, ForbiddenError, PaidPlanRequiredError
    )
    @console_ns.doc("set_conversation_log_export_email_notification")
    @console_ns.doc(description="Set the requester's email preference for this CSV export")
    @console_ns.expect(console_ns.models[LogExportEmailNotificationPayload.__name__])
    @console_ns.response(
        HTTPStatus.OK, "Email notification preference", console_ns.models[LogExportEmailNotificationResponse.__name__]
    )
    @console_account_admission(rbac_checks=(RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp()),))
    @model_validate(LogExportEmailNotificationPayload)
    def put(
        self, payload: LogExportEmailNotificationPayload, request_context: RequestContext, app_id: UUID, task_id: UUID
    ) -> tuple[dict[str, object], HTTPStatus, dict[str, str]]:
        """Update the caller's preference for a live export in the app."""
        try:
            task = self._get_task(request_context, app_id, task_id)
            return update_log_export_email_preference(
                task,
                account_id=request_context.account_id,
                export_kind=LogExportKind.CONVERSATION,
                enabled=payload.enabled,
            )
        except LogExportTaskNotFoundError as exc:
            raise ConversationLogExportTaskNotFoundHTTPError() from exc


@console_ns.route("/apps/<uuid:app_id>/conversation-log-exports/<uuid:task_id>/cancel")
class ConversationLogExportCancelApi(Resource):
    @error_responses(
        AppNotFoundError,
        ConversationLogExportTaskNotFoundHTTPError,
        LogExportTaskNotCancelableHTTPError,
        ForbiddenError,
        PaidPlanRequiredError,
    )
    @console_ns.doc(
        "cancel_conversation_log_export",
        description="Cancel a queued conversation CSV export task",
        params={"app_id": "Application ID", "task_id": "Export task ID"},
    )
    @console_ns.response(
        HTTPStatus.OK, "Export canceled", console_ns.models[ConversationLogExportStatusResponse.__name__]
    )
    @console_account_admission(rbac_checks=(RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp()),))
    def post(
        self, request_context: RequestContext, app_id: UUID, task_id: UUID
    ) -> tuple[dict[str, object], HTTPStatus, dict[str, str]]:
        """Cancel the admitted requester's queued task and return its new status."""
        scope = _resolve_log_export_scope(request_context, app_id)
        try:
            task = application_services().conversation_log_exports.cancel_task(
                tenant_id=scope.tenant_id,
                app_id=scope.app_id,
                task_id=str(task_id),
                requested_by=request_context.account_id,
            )
        except LogExportTaskNotFoundError as exc:
            raise ConversationLogExportTaskNotFoundHTTPError() from exc
        except LogExportTaskNotCancelableError as exc:
            raise LogExportTaskNotCancelableHTTPError() from exc
        return dump_response(ConversationLogExportStatusResponse, task), HTTPStatus.OK, {"Cache-Control": "no-store"}


@console_ns.route("/apps/<uuid:app_id>/conversation-log-exports/<uuid:task_id>/file")
class ConversationLogExportFileApi(Resource):
    @error_responses(
        AppNotFoundError,
        ConversationLogExportTaskNotFoundHTTPError,
        ConversationLogExportTaskNotReadyHTTPError,
        ConversationLogExportFileNotFoundHTTPError,
        ForbiddenError,
        PaidPlanRequiredError,
    )
    @console_ns.doc("download_conversation_log_export")
    @console_ns.doc(description="Download a completed CSV directly from object storage or from the Console API")
    @console_ns.doc(params={"app_id": "Application ID", "task_id": "Export task ID"})
    @console_ns.produces(["text/csv"])
    @console_ns.response(HTTPStatus.OK, "CSV attachment", console_ns.models[BinaryFileResponse.__name__])
    @console_ns.response(
        HTTPStatus.FOUND,
        "Redirect to a pre-signed CSV download URL",
        headers={"Location": {"description": "Pre-signed object storage URL", "type": "string"}},
    )
    @console_account_admission(rbac_checks=(RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp()),))
    def get(self, request_context: RequestContext, app_id: UUID, task_id: UUID) -> Response:
        """Admit the app and ready task before redirecting or streaming the CSV."""
        scope = _resolve_log_export_scope(request_context, app_id)
        filename = f"conversation-logs-{task_id}.csv"
        try:
            download = application_services().conversation_log_exports.download_csv(
                tenant_id=scope.tenant_id, app_id=scope.app_id, task_id=str(task_id), filename=filename
            )
        except LogExportTaskNotFoundError as exc:
            raise ConversationLogExportTaskNotFoundHTTPError() from exc
        except LogExportTaskNotReadyError as exc:
            raise ConversationLogExportTaskNotReadyHTTPError() from exc
        except LogExportFileNotFoundError as exc:
            raise ConversationLogExportFileNotFoundHTTPError() from exc
        # response-contract:ignore signed redirect or streamed CSV attachment
        return log_export_file_response(download, filename=filename)
