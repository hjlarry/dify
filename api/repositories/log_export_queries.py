"""Read log export rows, counts, and completion metadata."""

import logging
from collections.abc import Callable
from enum import StrEnum
from random import uniform
from time import sleep

from psycopg2 import Error as PostgreSQLDriverError
from psycopg2 import OperationalError as PostgreSQLDriverOperationalError
from psycopg2 import extensions as pg_extensions
from psycopg2.errors import QueryCanceled
from sqlalchemy import Select, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from models.account import Account
from models.agent import WorkflowAgentNodeBinding
from models.model import App
from repositories.agent.agent_runtime_app import find_runtime_resolvable_agent
from services.retention.log_export_task import LogExportKind

_LOG_EXPORT_COUNT_TIMEOUT_MS = 1500
_LOG_EXPORT_RECOVERY_RETRY_DELAYS = (1.0, 2.0, 4.0)
_LOG_EXPORT_RECOVERY_CONFLICT_MESSAGES = (
    "canceling statement due to conflict with recovery",
    "terminating connection due to conflict with recovery",
)
logger = logging.getLogger(__name__)


def execute_log_export_count[CountT: tuple[object, ...]](session: Session, statement: Select[CountT]) -> CountT | None:
    """Execute a one-row count in a dedicated read session and return None on statement timeout.

    The caller closes the session on all paths. The PostgreSQL timeout is local
    to that transaction. Databases other than PostgreSQL and MySQL use their own defaults.
    """
    dialect = session.get_bind().dialect.name
    try:
        if dialect == "postgresql":
            session.execute(text(f"SET LOCAL statement_timeout = {_LOG_EXPORT_COUNT_TIMEOUT_MS}"))
        elif dialect == "mysql":
            statement = statement.prefix_with(f"/*+ MAX_EXECUTION_TIME({_LOG_EXPORT_COUNT_TIMEOUT_MS}) */")
        return session.execute(statement).tuples().one()
    except DBAPIError as exc:
        if isinstance(exc.orig, QueryCanceled) or (
            dialect == "mysql" and exc.orig is not None and exc.orig.args and exc.orig.args[0] == 3024
        ):
            return None
        raise


class _LogExportPageRetryReason(StrEnum):
    RECOVERY_CONFLICT = "recovery conflict"
    STANDBY_DISCONNECT = "standby disconnect"


def _log_export_requires_standby(session: Session) -> bool:
    """Inspect the live driver's effective connection policy before the page executes."""
    connection = session.connection()
    driver = connection.connection.driver_connection
    if not isinstance(driver, pg_extensions.connection):
        return False
    key = "log_export_requires_standby"
    # Connection.info lives with the pooled connection, and libpq resolves the DSN and environment.
    if key not in connection.info:
        connection.info[key] = driver.get_dsn_parameters().get("target_session_attrs") == "standby"
    return connection.info[key] is True and driver.get_parameter_status("in_hot_standby") != "off"


def _log_export_retry_reason(error: DBAPIError, *, requires_standby: bool) -> _LogExportPageRetryReason | None:
    """Recognize explicit recovery conflicts or confirmed disconnects on standby-only connections."""
    cause = error.orig
    if not isinstance(cause, PostgreSQLDriverError) or cause.pgcode not in (None, "40001"):
        return None
    message = (cause.diag.message_primary or str(cause).partition("\n")[0]).lower()
    if any(marker in message for marker in _LOG_EXPORT_RECOVERY_CONFLICT_MESSAGES):
        return _LogExportPageRetryReason.RECOVERY_CONFLICT
    if (
        requires_standby
        and error.connection_invalidated
        and isinstance(cause, PostgreSQLDriverOperationalError)
        and cause.pgcode is None
    ):
        return _LogExportPageRetryReason.STANDBY_DISCONNECT
    return None


def read_log_export_with_retry[PageT](
    session_factory: sessionmaker[Session],
    target_id: str,
    page_type: str,
    read: Callable[[Session], PageT],
    *,
    export_kind: str,
) -> PageT:
    """Read a complete export batch or a staged selection with the caller's fixed scope.

    The callback must restart any partial staging on retry and publish no output.
    Each attempt closes its session before returning or retrying. Raise the last error if the read fails.
    """
    retry_delays = _LOG_EXPORT_RECOVERY_RETRY_DELAYS
    for attempt, delay in enumerate((*retry_delays, None), start=1):
        requires_standby = False
        try:
            with session_factory() as session:
                requires_standby = _log_export_requires_standby(session)
                try:
                    return read(session)
                except DBAPIError as error:
                    if _log_export_retry_reason(error, requires_standby=requires_standby) is not None:
                        try:
                            session.invalidate()
                        except DBAPIError:
                            logger.warning("Failed to discard a %s log export page connection", export_kind)
                    raise
        except DBAPIError as error:
            reason = _log_export_retry_reason(error, requires_standby=requires_standby)
            sqlstate = error.orig.pgcode if isinstance(error.orig, PostgreSQLDriverError) else None
            target = "agent" if export_kind == "agent" else "app"
            if reason is None or delay is None:
                logger.warning(
                    "%s log export page failed: %s=%s page=%s attempt=%s/%s "
                    "reason=%s error=%s sqlstate=%s connection_invalidated=%s",
                    export_kind.capitalize(),
                    target,
                    target_id,
                    page_type,
                    attempt,
                    len(retry_delays) + 1,
                    reason or "not retryable",
                    type(error.orig).__name__,
                    sqlstate,
                    error.connection_invalidated,
                )
                raise
            logger.warning(
                "Retrying %s log export page after PostgreSQL %s: "
                "%s=%s page=%s retry=%s/%s sqlstate=%s connection_invalidated=%s",
                export_kind,
                reason,
                target,
                target_id,
                page_type,
                attempt,
                len(retry_delays),
                sqlstate,
                error.connection_invalidated,
            )
            sleep(delay + uniform(0, 0.25))  # noqa: S311
    raise AssertionError("Log export page retry loop exhausted without returning or raising")


def _read_log_export_names(
    session: Session,
    *,
    tenant_id: str,
    app_id: str,
    export_kind: LogExportKind,
    sources: tuple[str, ...] = (),
) -> tuple[str, list[str]]:
    """Read display names for the exported app and its selected sources within the task's workspace."""
    if export_kind is not LogExportKind.AGENT:
        name = session.scalar(select(App.name).where(App.id == app_id, App.tenant_id == tenant_id))
        return name or "", []

    agent = find_runtime_resolvable_agent(session, tenant_id=tenant_id, agent_id=app_id)
    if agent is None:
        return "", list(sources)
    if not sources:
        return agent.name, []

    runtime_id = agent.backing_app_id or agent.app_id
    webapp_source = f"webapp:{runtime_id}"
    names: dict[str, str] = {}
    if runtime_id and webapp_source in sources:
        runtime_name = session.scalar(select(App.name).where(App.id == runtime_id, App.tenant_id == tenant_id))
        if runtime_name:
            names[webapp_source] = runtime_name
    workflow_ids = {source.split(":", 2)[1] for source in sources if source.startswith("workflow:")}
    if workflow_ids:
        statement = (
            select(App.id, App.name)
            .join(WorkflowAgentNodeBinding, WorkflowAgentNodeBinding.app_id == App.id)
            .where(
                App.tenant_id == tenant_id,
                App.id.in_(workflow_ids),
                WorkflowAgentNodeBinding.tenant_id == tenant_id,
                WorkflowAgentNodeBinding.agent_id == app_id,
            )
            .distinct()
        )
        names.update({f"workflow:{app_id}": name for app_id, name in session.execute(statement)})
    return agent.name, [names.get(":".join(source.split(":", 2)[:2]), source) for source in sources]


class LogExportNotificationRepository:
    """Read display metadata for a saved task without keeping a session open during delivery."""

    def __init__(self, *, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def read_app_name(self, *, tenant_id: str, app_id: str, export_kind: LogExportKind) -> str:
        """Return the app name in the saved task's workspace, or an empty string if gone."""
        with self._session_factory() as session:
            name, _ = _read_log_export_names(session, tenant_id=tenant_id, app_id=app_id, export_kind=export_kind)
            return name

    def read_context(
        self,
        *,
        tenant_id: str,
        app_id: str,
        export_kind: LogExportKind,
        sources: tuple[str, ...],
        requested_by: str,
    ) -> tuple[str, list[str], str | None]:
        """Read the saved task's scoped names and the requester's timezone in one session."""
        with self._session_factory() as session:
            name, source_names = _read_log_export_names(
                session, tenant_id=tenant_id, app_id=app_id, export_kind=export_kind, sources=sources
            )
            timezone_name = session.scalar(select(Account.timezone).where(Account.id == requested_by))
            return name, source_names, timezone_name
