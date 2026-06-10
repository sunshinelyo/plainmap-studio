"""WSGI entry point for PythonAnywhere's standard web app hosting."""

from a2wsgi import WSGIMiddleware

from backend.main import app


application = WSGIMiddleware(app)
