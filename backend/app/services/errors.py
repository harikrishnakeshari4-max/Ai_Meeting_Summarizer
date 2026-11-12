class ProcessingError(Exception):
    """A pipeline failure with an HTTP-style status code and a user-facing message."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class Cancelled(Exception):
    """Raised inside the pipeline when the user cancels a job."""
