"""Write filtered Console conversation logs with CSV columns selected by the app mode."""

import json
from collections.abc import Iterable
from datetime import UTC
from typing import Protocol, TextIO

from libs.datetime_utils import ensure_naive_utc
from machinery.context import RequestContext
from services.entities.conversation_entities import (
    ConsoleConversationLogFilters,
    ConsoleConversationScope,
    ConversationLogExportRow,
)
from services.retention.log_export_csv import CsvRowProgress, write_log_export_csv

_LOG_CSV_IDENTITY_COLUMNS = ("app_id", "app_type", "end_user_id", "account_id", "account_name")
_LOG_CSV_MESSAGE_COLUMNS = (
    "message_id",
    "created_at",
    "user_input",
    "app_response",
    "feedback_rating",
    "feedback_content",
)
_CHAT_LOG_CSV_COLUMNS = (*_LOG_CSV_IDENTITY_COLUMNS, "conversation_id", *_LOG_CSV_MESSAGE_COLUMNS)
_LOG_CSV_LAYOUTS = {
    "chat": ("Chatbot", _CHAT_LOG_CSV_COLUMNS),
    "advanced-chat": ("Chatflow", (*_CHAT_LOG_CSV_COLUMNS, "status")),
    "agent-chat": ("Agent", _CHAT_LOG_CSV_COLUMNS),
    "completion": ("Text Generator", (*_LOG_CSV_IDENTITY_COLUMNS, *_LOG_CSV_MESSAGE_COLUMNS)),
}


class UnsupportedConversationLogExportModeError(ValueError):
    """The requested app mode has no conversation log CSV layout."""


class ConversationLogCsvSource(Protocol):
    def get_console_log_export_scope(self, context: RequestContext, app_id: str) -> ConsoleConversationScope:
        """Return the owned conversation app scope for an admitted Console caller."""
        ...

    def iter_console_log_export_rows(
        self, *, scope: ConsoleConversationScope, filters: ConsoleConversationLogFilters
    ) -> Iterable[ConversationLogExportRow]:
        """Read all messages in matching conversations and release the session between batches."""
        ...


class ConversationLogCsvWriter:
    """Write one CSV row for each message in the matching conversations."""

    def __init__(self, *, logs: ConversationLogCsvSource) -> None:
        """Use the scoped conversation log reader for worker and CLI exports."""
        self._logs = logs

    def write_csv(
        self,
        context: RequestContext,
        app_id: str,
        *,
        filters: ConsoleConversationLogFilters,
        output: TextIO,
        report_rows: CsvRowProgress | None = None,
    ) -> int:
        """Write the app's filtered logs with its mode's columns and return the data row count.

        Require an admitted caller and a writable stream opened with newline="". The caller
        owns the stream and publishes it only after success, since a failure may leave partial output.
        """
        scope = self._logs.get_console_log_export_scope(context, app_id)
        return self.write_scoped_csv(scope=scope, filters=filters, output=output, report_rows=report_rows)

    def write_scoped_csv(
        self,
        *,
        scope: ConsoleConversationScope,
        filters: ConsoleConversationLogFilters,
        output: TextIO,
        report_rows: CsvRowProgress | None = None,
    ) -> int:
        """Write the CSV for a previously resolved app scope with UTC filters and return the row count.

        Reject unsupported modes before writing. The caller owns the UTF-8 stream and
        publishes it after success.
        """
        layout = _LOG_CSV_LAYOUTS.get(scope.app_mode)
        if layout is None:
            raise UnsupportedConversationLogExportModeError("App mode does not support conversation log CSV exports.")
        app_type, columns = layout

        rows = self._logs.iter_console_log_export_rows(scope=scope, filters=filters)
        return write_log_export_csv(
            output,
            (
                {
                    "app_id": scope.app_id,
                    "app_type": app_type,
                    "end_user_id": row.end_user_id,
                    "account_id": row.account_id,
                    "account_name": row.account_name,
                    "conversation_id": row.conversation_id,
                    "message_id": row.message_id,
                    "created_at": ensure_naive_utc(row.created_at).replace(tzinfo=UTC).isoformat(),
                    "user_input": json.dumps(row.input_variables, ensure_ascii=False)
                    if row.input_variables
                    else row.user_input,
                    "app_response": row.app_response,
                    "feedback_rating": row.feedback_rating,
                    "feedback_content": row.feedback_content,
                    "status": row.status,
                }
                for row in rows
            ),
            columns=columns,
            report_rows=report_rows,
        )
