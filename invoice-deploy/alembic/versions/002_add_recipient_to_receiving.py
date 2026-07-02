"""add recipient column to receiving_notes

Revision ID: 002
Revises: 001
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "d24b0710d98a"


def upgrade():
    op.add_column("receiving_notes", sa.Column("recipient", sa.String(50), nullable=True))


def downgrade():
    op.drop_column("receiving_notes", "recipient")
