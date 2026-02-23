"""add chat text and feedback rating columns

Revision ID: 20260223_000004
Revises: 20260222_000003
Create Date: 2026-02-23 00:00:04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260223_000004"
down_revision = "20260222_000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("text", sa.Text(), nullable=False, server_default=sa.text("''")))
    op.add_column("feedback", sa.Column("rating", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("feedback", "rating")
    op.drop_column("chat_messages", "text")

