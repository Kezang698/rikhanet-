"""A connection context commits on success, rolls back on failure, and closes."""
import psycopg
from psycopg.rows import dict_row
from . import config


def connect():
    return psycopg.connect(config.PG_DSN, row_factory=dict_row, connect_timeout=5,
                           options="-c timezone=UTC -c statement_timeout=15000")
