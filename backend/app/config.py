import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "ScholarAgent API & Semantic RAG"
    VERSION: str = "3.0.0"
    DEFAULT_POLITE_EMAIL: str = os.getenv("POLITE_EMAIL", "academic.researcher@scholaragent.app")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    IEEE_API_KEY: str = os.getenv("IEEE_API_KEY", "")
    ELSEVIER_API_KEY: str = os.getenv("ELSEVIER_API_KEY", "")
    SPRINGER_API_KEY: str = os.getenv("SPRINGER_API_KEY", "")
    S2_API_KEY: str = os.getenv("S2_API_KEY", "")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
