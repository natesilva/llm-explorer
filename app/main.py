from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.schemas import (
    GenerationRequest,
    GenerationResponse,
    SwitchModelRequest,
    DownloadModelRequest,
)
from app.llm import LLMEngine
from app.models_manager import ModelManager, MODEL_DIR
import os

app = FastAPI(title="LLM Explorer")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/")
def read_root():
    return FileResponse("app/static/index.html")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/next-tokens", response_model=GenerationResponse)
def get_next_tokens(request: GenerationRequest):
    engine = LLMEngine()  # Singleton access
    try:
        candidates = engine.get_next_tokens(
            request.text,
            temp=request.temp,
            top_k=request.top_k,
            top_p=request.top_p,
            repeat_penalty=request.repeat_penalty,
        )
        return {"candidates": candidates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models")
def list_models():
    manager = ModelManager()
    return manager.list_local_models()


@app.get("/models/lookup")
def lookup_models(repo_id: str):
    manager = ModelManager()
    return manager.list_remote_files(repo_id)


@app.post("/models/download")
def download_model(request: DownloadModelRequest):
    manager = ModelManager()
    try:
        path = manager.download_model(request.repo_id, request.filename)
        return {"status": "success", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/models/switch")
def switch_model(request: SwitchModelRequest):
    engine = LLMEngine()
    # Verify file exists in models dir
    target_path = os.path.join(MODEL_DIR, request.filename)
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Model not found")

    try:
        engine.load_model(target_path)
        return {"status": "success", "model": request.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
