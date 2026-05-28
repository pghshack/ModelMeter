"""FastAPI app for Vercel — serves /api/models and /api/refresh."""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from _lib import build_response, init_secrets

init_secrets()

app = FastAPI(title="Model Meter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/models")
def get_models():
    try:
        return build_response()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/refresh")
def post_refresh():
    return {"status": "ok"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


_public = Path(__file__).parent / "public"
app.mount("/", StaticFiles(directory=str(_public), html=True), name="static")
