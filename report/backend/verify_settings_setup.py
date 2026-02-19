#!/usr/bin/env python3
"""
Verification script for Settings API setup
Run this to check if all components are properly configured
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def check_model():
    """Check if UserSettings model exists"""
    try:
        from app.models.user import UserSettings

        print("✅ UserSettings model found")
        print(f"   Table: {UserSettings.__tablename__}")
        return True
    except ImportError as e:
        print(f"❌ UserSettings model not found: {e}")
        return False


def check_schemas():
    """Check if settings schemas exist"""
    try:
        from app.schemas.settings import UserSettingsResponse, UserSettingsUpdate

        print("✅ Settings schemas found")
        print(f"   - UserSettingsResponse")
        print(f"   - UserSettingsUpdate")
        return True
    except ImportError as e:
        print(f"❌ Settings schemas not found: {e}")
        return False


def check_api():
    """Check if settings API router exists"""
    try:
        from app.api.settings import router

        print("✅ Settings API router found")
        routes = [route.path for route in router.routes]
        print(f"   Routes: {', '.join(routes)}")
        return True
    except ImportError as e:
        print(f"❌ Settings API router not found: {e}")
        return False


def check_env():
    """Check if Supabase Storage environment variables are set"""
    from dotenv import load_dotenv

    load_dotenv()

    required_vars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]

    missing = []
    for var in required_vars:
        if not os.getenv(var):
            missing.append(var)

    if missing:
        print(f"⚠️  Supabase Storage environment variables missing:")
        for var in missing:
            print(f"   - {var}")
        print("   Profile image upload will not work without these")
        return False
    else:
        print("✅ Supabase Storage environment variables configured")
        return True


def check_migration():
    """Check if migration file exists"""
    migration_dir = "alembic/versions"
    migration_file = "00eedacd1b97_add_automation_and_settings_tables.py"
    migration_path = os.path.join(migration_dir, migration_file)

    if os.path.exists(migration_path):
        print("✅ Settings migration file found")
        print(f"   {migration_file}")
        return True
    else:
        print(f"❌ Settings migration file not found: {migration_path}")
        return False


def main():
    print("=" * 60)
    print("Settings API Setup Verification")
    print("=" * 60)
    print()

    checks = [
        ("Model", check_model),
        ("Schemas", check_schemas),
        ("API Router", check_api),
        ("Migration", check_migration),
        ("Environment", check_env),
    ]

    results = []
    for name, check_func in checks:
        print(f"\nChecking {name}...")
        results.append(check_func())
        print()

    print("=" * 60)
    print("Summary")
    print("=" * 60)

    passed = sum(results)
    total = len(results)

    if passed == total:
        print(f"✅ All checks passed ({passed}/{total})")
        print("\nNext steps:")
        print("1. Run: alembic upgrade head")
        print("2. Start the backend server")
        print("3. Test the API endpoints")
    else:
        print(f"⚠️  {passed}/{total} checks passed")
        print("\nPlease fix the issues above before proceeding")

    print()


if __name__ == "__main__":
    main()
