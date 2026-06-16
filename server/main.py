import os
import sys

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import create_tables
from routes.advisor_route import router as advisor_router
from routes.history_route import router as history_router
from routes.parse_route import router as parse_router

if sys.platform == "win32":
    cert_path = os.environ.get("SSL_CERT_FILE", r"C:\certs\cacert.pem")
    if os.path.exists(cert_path):
        os.environ["SSL_CERT_FILE"] = cert_path

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

create_tables()

app.include_router(parse_router)
app.include_router(history_router)
app.include_router(advisor_router)
