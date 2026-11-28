from collections.abc import Callable
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TextIO

from extensions.ext_storage import storage
from services.retention.log_export_task import LogExportDownload, LogExportFileNotFoundError
from services.system_feature_service import SystemFeatureService


def store_log_export_csv(storage_key: str, write_csv: Callable[[TextIO], int]) -> int:
    """Write a UTF-8 CSV to a private temporary file, then upload it and return the row count."""
    with TemporaryDirectory() as directory:
        path = Path(directory) / "logs.csv"
        with path.open("w", encoding="utf-8", newline="") as output:
            row_count = write_csv(output)
        storage.save_from_path(storage_key, path)
        return row_count


def open_log_export_csv(storage_key: str, expires_in: int, filename: str) -> LogExportDownload:
    """Sign the Cloud S3 download or open the CSV through the configured storage."""
    if SystemFeatureService.use_presigned_log_export_downloads():
        return storage.generate_presigned_url(
            storage_key, expires_in=expires_in, content_type="text/csv; charset=utf-8", download_filename=filename
        )

    # Read the first chunk before sending headers so a missing CSV can return a 404.
    try:
        stream = storage.load(storage_key, stream=True)
        return next(stream), stream
    except (FileNotFoundError, StopIteration) as exc:
        raise LogExportFileNotFoundError() from exc
