import threading
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional
import uuid
import time

class SyncJob:
    def __init__(self, source_uri: str, source_db: str, dest_uri: str, dest_db: str):
        self.id = str(uuid.uuid4())
        self.source_uri = source_uri
        self.source_db = source_db
        self.dest_uri = dest_uri
        self.dest_db = dest_db
        self.logs: List[str] = []
        self.status: str = "pending"  # pending | running | success | error
        self.error: Optional[str] = None
        self._thread: Optional[threading.Thread] = None
        self.progress: int = 0  # 0..100
        self._cancel: bool = False
        self._current_proc: Optional[subprocess.Popen] = None

    def log(self, msg: str):
        ts = time.strftime("%H:%M:%S")
        self.logs.append(f"[{ts}] {msg}")

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run_cmd(self, args: List[str]):
        # Run a command and stream stdout/stderr to logs
        try:
            proc = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            self._current_proc = proc
            assert proc.stdout is not None
            for line in iter(proc.stdout.readline, ''):
                if self._cancel:
                    try:
                        proc.terminate()
                    except Exception:
                        pass
                    raise RuntimeError("Cancelled")
                self.log(line.rstrip())
            proc.wait()
            if proc.returncode != 0:
                raise subprocess.CalledProcessError(proc.returncode, args)
        except Exception as e:
            raise e
        finally:
            self._current_proc = None

    def _run(self):
        self.status = "running"
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                dump_dir = Path(temp_dir)
                dump_path_db = dump_dir / self.source_db

                self.log("[1/4] Dumping from source...")
                self.progress = 10
                self._run_cmd([
                    'mongodump',
                    f'--uri={self.source_uri}',
                    f'--db={self.source_db}',
                    f'--out={dump_dir}',
                ])

                self.log("[2/4] Converting BSON to JSON...")
                self.progress = 35
                for bson_file in dump_path_db.glob("*.bson"):
                    self._run_cmd(['bsondump', f'--outFile={bson_file.with_suffix(".json")}', str(bson_file)])
                    if self._cancel:
                        raise RuntimeError("Cancelled")

                self.log("[3/4] Importing data...")
                self.progress = 60
                for json_file in dump_path_db.glob("*.json"):
                    if not json_file.name.endswith('.metadata.json'):
                        self._run_cmd([
                            'mongoimport',
                            f'--uri={self.dest_uri}',
                            f'--db={self.dest_db}',
                            f'--collection={json_file.stem}',
                            '--mode=upsert',
                            '--drop',
                            f'--file={json_file}',
                        ])
                        if self._cancel:
                            raise RuntimeError("Cancelled")

                self.log("[4/4] Restoring indexes ...")
                self.progress = 85
                self._run_cmd([
                    'mongorestore',
                    f'--uri={self.dest_uri}',
                    f'--nsFrom={self.source_db}.*',
                    f'--nsTo={self.dest_db}.*',
                    str(dump_dir),
                ])

            self.log("Sync completed successfully.")
            self.status = "success"
            self.progress = 100
        except Exception as e:
            self.error = str(e)
            self.log(f"ERROR: {e}")
            self.status = "error"
            # if cancelled, reflect in status
            if isinstance(e, RuntimeError) and str(e) == "Cancelled":
                self.status = "error"
                self.error = "Cancelled by user"

class SyncJobManager:
    def __init__(self):
        self._jobs: Dict[str, SyncJob] = {}
        self._lock = threading.Lock()

    def create(self, source_uri: str, source_db: str, dest_uri: str, dest_db: str) -> SyncJob:
        job = SyncJob(source_uri, source_db, dest_uri, dest_db)
        with self._lock:
            self._jobs[job.id] = job
        job.start()
        return job

    def get(self, job_id: str) -> Optional[SyncJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> List[Dict[str, str]]:
        with self._lock:
            return [
                {"id": j.id, "status": j.status, "error": j.error}
                for j in self._jobs.values()
            ]

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
        if not job:
            return False
        job._cancel = True
        if job._current_proc and job._current_proc.poll() is None:
            try:
                job._current_proc.terminate()
            except Exception:
                pass
        job.log("Cancellation requested by user.")
        return True

sync_mgr = SyncJobManager()
