"""Detached identities used by Console log filters."""

from dataclasses import dataclass
from enum import StrEnum


class ConsoleLogIdentitySource(StrEnum):
    END_USER = "end-user"
    ACCOUNT = "account"


@dataclass(frozen=True, slots=True)
class ConsoleLogIdentity:
    """Display label and the exact ID accepted by the Console Logs filters."""

    id: str
    label: str
    source: ConsoleLogIdentitySource
