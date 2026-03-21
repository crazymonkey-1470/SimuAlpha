"""SimuAlpha Worker — entrypoint for the job runner service."""

import logging
import signal
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("simualpha.worker")


def shutdown(signum: int, frame: object) -> None:
    logger.info("Shutting down worker (signal %s)", signum)
    sys.exit(0)


def main() -> None:
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info("SimuAlpha worker started")

    # Future: register and run scheduled jobs, consume task queues, etc.
    # This entrypoint will be expanded as job runner infrastructure is added.

    logger.info("No jobs configured yet — worker idle")


if __name__ == "__main__":
    main()
