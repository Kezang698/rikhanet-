"""python -m backend.init_db -- safe to run again, no observation/demo import."""
from pathlib import Path
from .db import connect
from .seed_gewog_info import seed


def initialize():
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(72645401)")
        conn.execute(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))
        count = seed(conn)
        conn.execute(Path(__file__).with_name("workflows.sql").read_text(encoding="utf-8"))
    return count


if __name__ == "__main__":
    print(f"Database initialized. Added {initialize()} reference gewogs.")
