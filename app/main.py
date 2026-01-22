from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.schemas import GenerationRequest, GenerationResponse
from app.llm import LLMEngine
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
            request.text, temp=request.temp, top_k=request.top_k
        )
        return {"candidates": candidates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
