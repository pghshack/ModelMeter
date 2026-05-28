import logging
import logging.handlers
import uuid
from pathlib import Path


def setup_logging(name: str, log_dir: str = "logs", level: int = logging.DEBUG) -> tuple[logging.Logger, str]:
    run_id = str(uuid.uuid4())[:8]
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)

    fmt = f"[%(asctime)s] [{run_id}] %(levelname)s %(name)s: %(message)s"
    formatter = logging.Formatter(fmt, datefmt="%Y-%m-%d %H:%M:%S")

    logger = logging.getLogger(name)
    logger.setLevel(level)

    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(formatter)

    file_handler = logging.handlers.RotatingFileHandler(
        log_path / f"{name}.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)

    logger.addHandler(console)
    logger.addHandler(file_handler)

    return logger, run_id
