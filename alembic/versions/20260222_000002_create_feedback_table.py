"""create feedback table

Revision ID: 20260222_000002
Revises: 20260222_000001
Create Date: 2026-02-22 00:00:02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260222_000002"
down_revision = "20260222_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_feedback_id", "feedback", ["id"], unique=False)
    op.create_index("ix_feedback_email", "feedback", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_feedback_email", table_name="feedback")
    op.drop_index("ix_feedback_id", table_name="feedback")
    op.drop_table("feedback")
