# app/api/deps.py
"""Dependencias compartidas por los routers de la API."""
from app.core.security import require_auth
from app.database.db_config import get_db

__all__ = ["get_db", "require_auth"]
