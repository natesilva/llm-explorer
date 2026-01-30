from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.schemas import (
    GenerationRequest,
    GenerationResponse,
    SwitchModelRequest,
    DownloadModelRequest,
    DownloadsStatusResponse,
)
from app.llm import LLMEngine
from app.models_manager import ModelManager, MODEL_DIR
from app.download_manager import DownloadManager
import os

app = FastAPI(title="LLM Explorer")

# Mount static files with cache busting for development
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


@app.get("/models/current")
def get_current_model():
    """Get the currently loaded model filename."""
    try:
        from app.llm import LLMEngine
        engine = LLMEngine()
        current_model = engine.get_current_model()
        if current_model:
            # Return just the filename
            import os
            filename = os.path.basename(current_model)
            return {"model": filename}
        return {"model": None}
    except Exception:
        return {"model": None}


@app.get("/models/lookup")
def lookup_models(repo_id: str):
    manager = ModelManager()
    return manager.list_remote_files(repo_id)


@app.post("/models/download")
def download_model(request: DownloadModelRequest):
    download_mgr = DownloadManager()
    model_mgr = ModelManager()

    # Create a download record
    download_id = download_mgr.create_download(request.repo_id, request.filename)

    # Start download in background - capture download_id in closure
    def run_download():
        try:
            model_mgr.download_model(request.repo_id, request.filename, download_id=download_id)
        except Exception:
            pass  # Error already set in download_manager

    download_mgr.start_download_thread(download_id, run_download)

    return {"download_id": download_id, "status": "started"}


@app.get("/downloads/status", response_model=DownloadsStatusResponse)
def get_downloads_status():
    download_mgr = DownloadManager()
    downloads = download_mgr.get_all_downloads()

    return DownloadsStatusResponse(
        downloads=[download_mgr.to_dict(d) for d in downloads],
        active_count=len(download_mgr.get_active_downloads()),
    )


@app.delete("/downloads/{download_id}")
def cancel_download(download_id: str):
    download_mgr = DownloadManager()
    success = download_mgr.cancel_download(download_id)
    if not success:
        raise HTTPException(status_code=404, detail="Download not found or cannot be cancelled")
    return {"status": "cancelled"}


@app.post("/models/switch")
def switch_model(request: SwitchModelRequest):
    engine = LLMEngine()
    # Verify file exists in models dir
    target_path = os.path.join(MODEL_DIR, request.filename)
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Model not found")

    try:
        engine.load_model(target_path)

        # Get friendly name from metadata
        from app.models_manager import load_model_metadata
        metadata = load_model_metadata()
        model_meta = metadata.get(request.filename, {})
        friendly_name = model_meta.get('friendly_name', request.filename)

        return {"status": "success", "model": request.filename, "friendly_name": friendly_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
