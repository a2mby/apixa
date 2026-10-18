# Apixa test backend

Real FastAPI server used while developing and exercising Apixa against HTTP.

## Run

From the repo root:

**macOS**

```bash
chmod +x scripts/macos/*.sh scripts/lib/*.sh   # once
./scripts/macos/run-backend.sh
./scripts/macos/stop-backend.sh
./scripts/macos/restart-backend.sh
```

**Linux**

```bash
chmod +x scripts/linux/*.sh scripts/lib/*.sh   # once
./scripts/linux/run-backend.sh
./scripts/linux/stop-backend.sh
./scripts/linux/restart-backend.sh
```

**Windows**

```bat
scripts\win\run-backend.bat
scripts\win\stop-backend.bat
scripts\win\restart-backend.bat
```

Frontend example runners (Next, React, Vue, vanilla, Angular, React Native, basic) are documented in [`scripts/README.md`](../scripts/README.md).

Or manually:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8787 --reload
```

Optional env overrides: `APIXA_BACKEND_HOST`, `APIXA_BACKEND_PORT`.

- API docs: http://127.0.0.1:8787/docs
- Health: http://127.0.0.1:8787/health

## Add more resources / test surfaces

1. Create `scenarios/<name>.py` exporting `router = APIRouter()` (optional `PREFIX`, `TAGS`).
2. Enable it in `config.yaml`:

```yaml
scenarios:
  users: true
  posts: true
  <name>: true
```

Restart uvicorn (or rely on `--reload`). New routes appear under `/docs`.
