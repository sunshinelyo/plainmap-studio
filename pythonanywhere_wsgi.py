"""WSGI entry point for PythonAnywhere's standard web app hosting."""

from a2wsgi import ASGIMiddleware

from backend.main import app


application = ASGIMiddleware(app)
