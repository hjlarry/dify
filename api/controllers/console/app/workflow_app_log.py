from datetime import datetime
from http import HTTPStatus
from typing import Any
from uuid import UUID

from dateutil.parser import isoparse
from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from controllers.common.rbac import PlainApp, RBACCheck
from controllers.common.schema import (
    query_params_from_model,
    query_params_from_request,
    register_response_schema_models,
    register_schema_models,
)
from controllers.console import console_ns
from controllers.console.app.error import (
    AppNotFoundError,
)
from controllers.console.app.wraps import get_app_model
from controllers.console.flask_admission import console_account_admission
from controllers.console.wraps import RBACPermission
from extensions.ext_application_services import application_services
from fields.base import ResponseModel
from fields.end_user_fields import SimpleEndUser
from fields.member_fields import SimpleAccount
from graphon.enums import WorkflowExecutionStatus
from libs.exception import BaseHTTPException
from libs.external_api import error_responses
from libs.helper import dump_response, to_timestamp
from machinery.context import RequestContext
from models import App
from models.model import AppMode
from services.app.console_service import ConsoleAppNotFoundError
from services.entities.conversation_entities import ConsoleLogIdentitySource
from services.workflow_app_log_contracts import WorkflowLogScope


class WorkflowAppLogQuery(BaseModel):
    keyword: str | None = Field(default=None, description="Search keyword for filtering logs")
    status: WorkflowExecutionStatus | None = Field(default=None, description="Execution status filter")
    created_at__before: datetime | None = Field(default=None, description="Filter logs created before this timestamp")
    created_at__after: datetime | None = Field(default=None, description="Filter logs created after this timestamp")
    created_by_end_user_session_id: str | None = Field(default=None, description="Filter by end user session ID")
    created_by_account: str | None = Field(default=None, description="Filter by account")
    end_user_ids: list[UUID] = Field(default_factory=list, description="End user IDs to include")
    account_ids: list[UUID] = Field(default_factory=list, description="Account IDs to include")
    detail: bool = Field(default=False, description="Whether to return detailed logs")
    page: int = Field(default=1, ge=1, le=99999, description="Page number (1-99999)")
    limit: int = Field(default=20, ge=1, le=100, description="Number of items per page (1-100)")

    @field_validator("created_at__before", "created_at__after", mode="before")
    @classmethod
    def parse_datetime(cls, value: str | None) -> datetime | None:
        if value in (None, ""):
            return None
        return isoparse(value)  # type: ignore

    @field_validator("detail", mode="before")
    @classmethod
    def parse_bool(cls, value: bool | str | None) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        lowered = value.lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
        raise ValueError("Invalid boolean value for detail")


class WorkflowRunForLogResponse(ResponseModel):
    id: str
    version: str | None = None
    status: str | None = None
    triggered_from: str | None = None
    error: str | None = None
    elapsed_time: float | None = None
    total_tokens: int | None = None
    total_steps: int | None = None
    created_at: int | None = None
    finished_at: int | None = None
    exceptions_count: int | None = None

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            return value
        return str(getattr(value, "value", value))

    @field_validator("created_at", "finished_at", mode="before")
    @classmethod
    def _normalize_timestamp(cls, value: datetime | int | None) -> int | None:
        return to_timestamp(value)


class WorkflowAppLogEvaluationNodeInfoResponse(ResponseModel):
    node_id: str
    type: str
    title: str


class WorkflowAppLogEvaluationItemResponse(ResponseModel):
    name: str
    value: Any = None
    details: dict[str, Any] = Field(default_factory=dict)
    node_info: WorkflowAppLogEvaluationNodeInfoResponse | None = Field(
        default=None,
        serialization_alias="nodeInfo",
    )


class WorkflowAppLogPartialResponse(ResponseModel):
    id: str
    workflow_run: WorkflowRunForLogResponse | None = None
    details: Any = None
    evaluation: list[WorkflowAppLogEvaluationItemResponse] = Field(default_factory=list)
    created_from: str | None = None
    created_by_role: str | None = None
    created_by_account: SimpleAccount | None = None
    created_by_end_user: SimpleEndUser | None = None
    created_at: int | None = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_timestamp(cls, value: datetime | int | None) -> int | None:
        return to_timestamp(value)


class WorkflowAppLogPaginationResponse(ResponseModel):
    page: int
    limit: int
    total: int
    has_more: bool
    data: list[WorkflowAppLogPartialResponse]


register_schema_models(
    console_ns,
    WorkflowAppLogQuery,
    WorkflowRunForLogResponse,
    WorkflowAppLogEvaluationNodeInfoResponse,
    WorkflowAppLogEvaluationItemResponse,
    WorkflowAppLogPartialResponse,
    WorkflowAppLogPaginationResponse,
)


class _WorkflowLogValidationError(BaseHTTPException):
    error_code = "unprocessable_entity"
    code = HTTPStatus.UNPROCESSABLE_ENTITY


@console_ns.route("/apps/<uuid:app_id>/workflow-app-logs")
class WorkflowAppLogApi(Resource):
    @error_responses(_WorkflowLogValidationError)
    @console_ns.doc("get_workflow_app_logs")
    @console_ns.doc(description="Get workflow application execution logs")
    @console_ns.doc(params={"app_id": "Application ID"})
    @console_ns.doc(params=query_params_from_model(WorkflowAppLogQuery))
    @console_ns.response(
        200,
        "Workflow app logs retrieved successfully",
        console_ns.models[WorkflowAppLogPaginationResponse.__name__],
    )
    @console_account_admission(
        rbac_checks=[RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp())],
    )
    @get_app_model(mode=[AppMode.WORKFLOW])
    def get(
        self,
        _request_context: RequestContext,
        app_model: App,
    ):
        """
        Get workflow app logs
        """
        try:
            req_data = query_params_from_request(WorkflowAppLogQuery, list_fields=("end_user_ids", "account_ids"))
        except ValidationError as exc:
            raise _WorkflowLogValidationError(
                exc.json(include_url=False, include_input=False, include_context=False)
            ) from None
        result = application_services().workflow_app_logs.list_logs(
            tenant_id=app_model.tenant_id,
            app_id=app_model.id,
            keyword=req_data.keyword,
            status=req_data.status,
            created_at_before=req_data.created_at__before,
            created_at_after=req_data.created_at__after,
            page=req_data.page,
            limit=req_data.limit,
            detail=req_data.detail,
            created_by_end_user_session_id=req_data.created_by_end_user_session_id,
            created_by_account=req_data.created_by_account,
            end_user_ids=tuple(map(str, req_data.end_user_ids)),
            account_ids=tuple(map(str, req_data.account_ids)),
        )
        return dump_response(WorkflowAppLogPaginationResponse, result)


class WorkflowAppLogIdentityQuery(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    keyword: str = Field(
        min_length=1, max_length=255, description="Part of an end-user ID or account name, or an exact internal ID"
    )


class WorkflowLogExportIdentityResponse(ResponseModel):
    id: str
    label: str
    source: ConsoleLogIdentitySource


class WorkflowLogExportIdentitySearchResponse(ResponseModel):
    data: list[WorkflowLogExportIdentityResponse]


def _get_workflow_log_scope(request_context: RequestContext, app_id: UUID) -> WorkflowLogScope:
    """Resolve the Workflow app in the admitted caller's current workspace."""
    try:
        return application_services().workflow_app_logs.get_log_scope(request_context, str(app_id))
    except ConsoleAppNotFoundError as exc:
        raise AppNotFoundError(str(exc)) from exc


register_response_schema_models(
    console_ns,
    WorkflowLogExportIdentityResponse,
    WorkflowLogExportIdentitySearchResponse,
)


@console_ns.route("/apps/<uuid:app_id>/workflow-app-logs/identity-options")
class WorkflowAppLogIdentityOptionsApi(Resource):
    @error_responses(AppNotFoundError, _WorkflowLogValidationError)
    @console_ns.doc("search_workflow_app_log_identities")
    @console_ns.doc(description="Search identities in the visible logs of a Workflow app")
    @console_ns.doc(params={"app_id": "Application ID", **query_params_from_model(WorkflowAppLogIdentityQuery)})
    @console_ns.response(
        HTTPStatus.OK, "Matching identities", console_ns.models[WorkflowLogExportIdentitySearchResponse.__name__]
    )
    @console_account_admission(rbac_checks=(RBACCheck(RBACPermission.APP_LOG_AND_ANNOTATION, PlainApp()),))
    def get(self, request_context: RequestContext, app_id: UUID) -> dict[str, object]:
        """Search app identities under the Logs permission granted by the route."""
        scope = _get_workflow_log_scope(request_context, app_id)
        try:
            query = query_params_from_request(WorkflowAppLogIdentityQuery)
        except ValidationError as exc:
            raise _WorkflowLogValidationError(
                exc.json(include_url=False, include_input=False, include_context=False)
            ) from None
        matches = application_services().workflow_app_logs.search_log_identities(scope=scope, keyword=query.keyword)
        return dump_response(WorkflowLogExportIdentitySearchResponse, {"data": matches})
