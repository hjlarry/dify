"""Format and send completion notifications for CSV log exports."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime, tzinfo
from string import punctuation
from typing import Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from configs import dify_config
from libs.datetime_utils import ensure_naive_utc, utc_now
from services.agent.observability_contracts import AgentLogExportFilters
from services.billing_client import saas
from services.entities.conversation_entities import ConsoleConversationLogFilters, ConsoleLogIdentitySource
from services.retention.agent.log_export_service import AgentLogExportTask
from services.retention.conversation.log_export_service import ConversationLogExportTask
from services.retention.log_export_task import LogExportKind
from services.retention.workflow_run.log_export_service import WorkflowLogExportTask
from services.system_feature_service import SystemFeatureService
from services.workflow_app_log_contracts import WorkflowLogExportFilters

type LogExportNotificationTask = ConversationLogExportTask | WorkflowLogExportTask | AgentLogExportTask


class LogExportNotificationQueries(Protocol):
    def read_app_name(self, *, tenant_id: str, app_id: str, export_kind: LogExportKind) -> str:
        """Return the saved export's app name within its workspace, or an empty string if gone."""
        ...

    def read_context(
        self,
        *,
        tenant_id: str,
        app_id: str,
        export_kind: LogExportKind,
        sources: tuple[str, ...],
        requested_by: str,
    ) -> tuple[str, list[str], str | None]:
        """Return scoped app and source labels plus the saved requester's timezone, if available."""
        ...


@dataclass(frozen=True, slots=True)
class _NoticeCopy:
    title: str
    download: str
    close: str
    all_logs: str
    time_range: str
    starting: str
    ending: str
    status: str
    search: str
    sources: str
    identities: str
    rows: str
    expires: str
    statuses: dict[str, str]


_LOG_EXPORT_NOTIFICATION_COPY = {
    "en-US": _NoticeCopy(
        title="Log export complete",
        download="Download CSV",
        close="Close",
        all_logs="All logs in this app",
        time_range="Time range",
        starting="From",
        ending="Until",
        status="Status",
        search="Search",
        sources="Sources",
        identities="End user or account",
        rows="CSV rows",
        expires="Expires",
        statuses={
            "annotated": "Annotated",
            "not_annotated": "Not Annotated",
            "failed": "Failure",
            "partial-succeeded": "Partial Success",
            "paused": "Paused",
            "running": "Running",
            "scheduled": "Scheduled",
            "stopped": "Stopped",
            "succeeded": "Success",
        },
    ),
    "zh-Hans": _NoticeCopy(
        title="日志导出已完成",
        download="下载 CSV",
        close="关闭",
        all_logs="此应用的全部日志",
        time_range="时间范围",
        starting="从",
        ending="截至",
        status="状态",
        search="搜索",
        sources="来源",
        identities="用户或账户",
        rows="CSV 行数",
        expires="到期时间",
        statuses={
            "annotated": "已标注",
            "not_annotated": "未标注",
            "failed": "失败",
            "partial-succeeded": "部分成功",
            "paused": "已暂停",
            "running": "运行中",
            "scheduled": "已调度",
            "stopped": "已停止",
            "succeeded": "成功",
        },
    ),
    "ja-JP": _NoticeCopy(
        title="ログのエクスポートが完了しました",
        download="CSV をダウンロード",
        close="閉じる",
        all_logs="このアプリのすべてのログ",
        time_range="期間",
        starting="開始",
        ending="終了",
        status="ステータス",
        search="検索",
        sources="ソース",
        identities="エンドユーザーまたはアカウント",
        rows="CSV 行数",
        expires="有効期限",
        statuses={
            "annotated": "注釈あり",
            "not_annotated": "注釈なし",
            "failed": "失敗",
            "partial-succeeded": "一部成功",
            "paused": "一時停止",
            "running": "実行中",
            "scheduled": "スケジュール済み",
            "stopped": "停止済み",
            "succeeded": "成功",
        },
    ),
}

_MARKDOWN_LITERAL = str.maketrans(
    {character: f"\\{character}" for character in punctuation} | {"&": "&amp;", "<": "&lt;", ">": "&gt;"}
)


def _log_export_notice_markdown(
    task: LogExportNotificationTask, *, sources: list[str], timezone: tzinfo, copy: _NoticeCopy
) -> str:
    """Format a completed export's scope, actual row count and deadline as notification Markdown."""
    filters = task.filters
    if isinstance(filters, WorkflowLogExportFilters):
        start, end = filters.created_at_after, filters.created_at_before
        status = filters.status.value if filters.status else None
        keyword = filters.keyword
    elif isinstance(filters, ConsoleConversationLogFilters):
        start, end = filters.start, filters.end
        status = filters.annotation_status if filters.annotation_status != "all" else None
        keyword = filters.keyword
    else:
        start, end = filters.start, filters.end
        status = keyword = None

    labels = {(identity.source, str(identity.id)): identity.label for identity in task.identity_labels}
    identities = [
        *(labels.get((ConsoleLogIdentitySource.END_USER, identity), identity) for identity in filters.end_user_ids),
        *(labels.get((ConsoleLogIdentitySource.ACCOUNT, identity), identity) for identity in filters.account_ids),
    ]
    range_label = ""
    if start is not None and end is not None:
        range_label = f"{_log_export_timestamp(start, timezone)} – {_log_export_timestamp(end, timezone)}"
    elif start is not None:
        range_label = f"{copy.starting} {_log_export_timestamp(start, timezone)}"
    elif end is not None:
        range_label = f"{copy.ending} {_log_export_timestamp(end, timezone)}"

    fields = (
        (copy.time_range, range_label),
        (copy.status, copy.statuses.get(status, status) if status else ""),
        (copy.search, keyword or ""),
        (copy.sources, ", ".join(sources)),
        (copy.identities, ", ".join(identities)),
    )
    lines = [_log_export_notice_line(label, value) for label, value in fields if value.strip()] or [copy.all_logs]
    if task.progress is not None:
        lines.append(_log_export_notice_line(copy.rows, f"{task.progress.rows_written:,}"))
    if task.expires_at is not None:
        lines.append(_log_export_notice_line(copy.expires, _log_export_timestamp(task.expires_at, timezone)))
    return "\n\n".join(lines)


def _log_export_notice_line(label: str, value: str) -> str:
    """Keep dynamic values literal in the shared Markdown renderer and limit long lists."""
    text = " ".join(value.split())
    if len(text) > 120:
        text = f"{text[:119].rstrip()}…"
    # Keep punctuation from creating links or directives, even when a value starts with `::`.
    return f"**{label}** — {text.translate(_MARKDOWN_LITERAL)}"


def _log_export_timestamp(value: datetime, timezone: tzinfo) -> str:
    """Format a persisted UTC bound using the requester's account timezone."""
    return ensure_naive_utc(value).replace(tzinfo=UTC).astimezone(timezone).strftime("%Y-%m-%d %H:%M")


def log_export_download_path(*, app_id: str, task_id: str, export_kind: LogExportKind) -> str:
    """Link to the existing Console download, which rechecks the task's permissions on access."""
    scope = (
        f"agent/{app_id}/log-exports"
        if export_kind is LogExportKind.AGENT
        else f"apps/{app_id}/{export_kind.value}-log-exports"
    )
    return f"/console/api/{scope}/{task_id}/file"


def notify_log_export_ready(
    task: LogExportNotificationTask, *, export_kind: LogExportKind, queries: LogExportNotificationQueries
) -> None:
    """Publish a one-time Cloud notification for the requester of a newly completed export."""
    if task.expires_at is None or not SystemFeatureService.is_log_export_notification_enabled():
        return

    path = log_export_download_path(app_id=task.app_id, task_id=task.task_id, export_kind=export_kind)
    url = f"{dify_config.CONSOLE_API_URL.rstrip('/')}{path}"
    app_name, sources, timezone_name = queries.read_context(
        tenant_id=task.tenant_id,
        app_id=task.app_id,
        export_kind=export_kind,
        sources=task.filters.sources if isinstance(task.filters, AgentLogExportFilters) else (),
        requested_by=task.requested_by,
    )
    try:
        timezone = ZoneInfo(timezone_name) if timezone_name else UTC
    except (ValueError, ZoneInfoNotFoundError):
        timezone = UTC
    contents = [
        saas.LangContent(
            lang=language,
            title=copy.title,
            subtitle=app_name,
            title_pic_url="/in-site-message/log-export-complete.webp",
            body=json.dumps(
                {
                    "log_export_task_id": task.task_id,
                    "main": _log_export_notice_markdown(task, sources=sources, timezone=timezone, copy=copy),
                    "actions": [
                        {
                            "type": "primary",
                            "action": "link",
                            "action_name": "download_log_export",
                            "text": copy.download,
                            "data": {"href": url},
                        },
                        {"type": "default", "action": "close", "action_name": "dismiss", "text": copy.close},
                    ],
                },
                ensure_ascii=False,
            ),
        )
        for language, copy in _LOG_EXPORT_NOTIFICATION_COPY.items()
    ]
    notice = saas.notification_upsert_notification(
        body=saas.UpsertNotificationReq(
            notification_id="",
            contents=contents,
            start_time=utc_now(),
            end_time=task.expires_at,
            frequency="once",
            status="active",
            is_global=False,
        )
    )
    saas.notification_batch_add_notification_accounts(
        notification_id=notice.notification_id,
        body=saas.BatchAddNotificationAccountsReq(
            notification_id=notice.notification_id, account_ids=[task.requested_by]
        ),
    )
