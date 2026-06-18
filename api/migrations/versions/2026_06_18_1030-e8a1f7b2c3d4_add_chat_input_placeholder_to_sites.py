"""add chat input placeholder to sites

Revision ID: e8a1f7b2c3d4
Revises: d2f1a4b8c3e0
Create Date: 2026-06-18 10:30:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'e8a1f7b2c3d4'
down_revision = 'd2f1a4b8c3e0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sites', schema=None) as batch_op:
        batch_op.add_column(sa.Column('chat_input_placeholder', sa.String(length=255), nullable=True))


def downgrade():
    with op.batch_alter_table('sites', schema=None) as batch_op:
        batch_op.drop_column('chat_input_placeholder')
