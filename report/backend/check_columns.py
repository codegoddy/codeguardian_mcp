from sqlalchemy import create_engine, inspect

from app.core.config import settings


def check_columns():
    engine = create_engine(settings.base_database_url)
    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("deliverables")]
    print(f"Columns in deliverables: {columns}")
    if "documentation_markdown" in columns:
        print("documentation_markdown exists")
    else:
        print("documentation_markdown does NOT exist")


if __name__ == "__main__":
    check_columns()
