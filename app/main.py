from fastapi import FastAPI

app = FastAPI(title="LLM Explorer")


@app.get("/health")
def health_check():
    return {"status": "ok"}
