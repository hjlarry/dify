"""Prepare a log export through the service for its log type."""

import logging
from typing import TYPE_CHECKING

from celery import shared_task

from extensions.ext_redis import redis_client
from services.retention.log_export_notification import notify_log_export_ready
from services.retention.log_export_task import LogExportKind, LogExportLeaseBusyError
from services.retention.log_export_task_cache import iter_log_export_queue_tenants, reserve_log_export_dispatch

if TYPE_CHECKING:
    from extensions.ext_redis import RedisClientWrapper

logger = logging.getLogger(__name__)


def dispatch_log_export_head(tenant_id: str, *, redis: "RedisClientWrapper") -> None:
    """Wake the workspace's next export; the persisted queue allows recovery after a failed publish."""
    try:
        head = reserve_log_export_dispatch(redis, tenant_id)
        if head is not None:
            kind, app_id, task_id = head
            prepare_log_export_task.apply_async(
                kwargs={"tenant_id": tenant_id, "app_id": app_id, "task_id": task_id, "export_kind": kind.value},
                task_id=task_id,
            )
    except Exception:
        logger.exception("Could not dispatch the next log export: tenant=%s", tenant_id)


@shared_task(
    name="tasks.log_export_tasks.prepare_log_export_task",
    queue="retention",
    acks_late=True,
    reject_on_worker_lost=True,
    autoretry_for=(LogExportLeaseBusyError,),
    retry_backoff=5,
    retry_backoff_max=60,
    max_retries=None,
)
def prepare_log_export_task(*, tenant_id: str, app_id: str, task_id: str, export_kind: str) -> None:
    """Prepare a saved export and notify its requester after this attempt publishes the ready CSV."""
    from extensions.ext_application_services import application_services

    services = application_services()
    kind = LogExportKind(export_kind)
    match kind:
        case LogExportKind.CONVERSATION:
            exports = services.conversation_log_exports
        case LogExportKind.WORKFLOW:
            exports = services.workflow_log_exports
        case LogExportKind.AGENT:
            exports = services.agent_log_exports

    logger.info("Preparing %s log export: tenant=%s app=%s task=%s", export_kind, tenant_id, app_id, task_id)
    try:
        ready_task = exports.prepare_task(tenant_id=tenant_id, app_id=app_id, task_id=task_id)
    finally:
        dispatch_log_export_head(tenant_id, redis=redis_client)
    if ready_task is None:
        return

    try:
        services.log_export_email_notifications.queue_if_requested(
            tenant_id=ready_task.tenant_id,
            app_id=ready_task.app_id,
            task_id=ready_task.task_id,
            requested_by=ready_task.requested_by,
            export_kind=kind,
        )
    except Exception:
        logger.exception("Could not queue log export email: tenant=%s app=%s task=%s", tenant_id, app_id, task_id)
    try:
        notify_log_export_ready(ready_task, export_kind=kind, queries=services.log_export_notification_queries)
    except Exception:
        logger.exception(
            "Could not notify requester after exporting logs: tenant=%s app=%s task=%s", tenant_id, app_id, task_id
        )


@shared_task(name="tasks.log_export_tasks.recover_log_export_queues", queue="retention", ignore_result=True)
def recover_log_export_queues() -> None:
    """Retry dispatch for workspace heads whose delivery or worker acknowledgment was lost."""
    for tenant_id in iter_log_export_queue_tenants(redis_client):
        dispatch_log_export_head(tenant_id, redis=redis_client)
