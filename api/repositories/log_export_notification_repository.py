"""Read task-scoped metadata for log export notifications."""

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from models.account import Account
from models.agent import WorkflowAgentNodeBinding
from models.model import App
from repositories.agent.agent_runtime_app import find_runtime_resolvable_agent
from services.retention.log_export_task import LogExportKind


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
