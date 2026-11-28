"""Match end users and accounts visible in an admitted log scope."""

from uuid import UUID

from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import Session

from libs.helper import escape_like_pattern
from models.account import Account
from models.model import EndUser
from services.entities.log_identity import ConsoleLogIdentity, ConsoleLogIdentitySource

_LOG_IDENTITY_SEARCH_LIMIT = 20


def search_log_identities(
    session: Session,
    *,
    tenant_id: str,
    keyword: str,
    end_user_visible: ColumnElement[bool],
    account_visible: ColumnElement[bool],
    fallback_to_end_user_id: bool = False,
) -> tuple[ConsoleLogIdentity, ...]:
    """Return up to 20 matches per identity type using the caller's scoped log predicates.

    The caller owns the session and supplies visibility predicates correlated to the respective identity table.
    """
    try:
        identity_id = str(UUID(keyword))
    except ValueError:
        identity_id = None

    pattern = f"%{escape_like_pattern(keyword)}%"
    exact_end_user_match = EndUser.session_id == keyword
    account_match = Account.name.ilike(pattern, escape="\\")
    if identity_id is not None:
        exact_end_user_match = or_(exact_end_user_match, EndUser.id == identity_id)
        account_match = or_(account_match, Account.id == identity_id)

    end_users = session.execute(
        select(EndUser.id, EndUser.session_id)
        .where(
            EndUser.tenant_id == tenant_id,
            or_(exact_end_user_match, EndUser.session_id.ilike(pattern, escape="\\")),
            end_user_visible,
        )
        .order_by(exact_end_user_match.desc(), EndUser.id)
        .limit(_LOG_IDENTITY_SEARCH_LIMIT)
    ).all()
    accounts = session.execute(
        select(Account.id, Account.name)
        .where(account_match, account_visible)
        .order_by(Account.name, Account.id)
        .limit(_LOG_IDENTITY_SEARCH_LIMIT)
    ).all()
    return (
        *(
            ConsoleLogIdentity(
                identity, (label or identity) if fallback_to_end_user_id else label, ConsoleLogIdentitySource.END_USER
            )
            for identity, label in end_users
        ),
        *(ConsoleLogIdentity(identity, label, ConsoleLogIdentitySource.ACCOUNT) for identity, label in accounts),
    )
