"""Domain errors mapped to HTTP responses in :mod:`app.main`."""


class NotFoundError(LookupError):
    """A requested record does not exist, or is not visible to the caller."""


class ConflictError(Exception):
    """The request collides with existing state, such as a duplicate username."""


class PermissionDeniedError(Exception):
    """The caller is a board member but lacks the role needed for this action."""


class InvalidRequestError(ValueError):
    """The request is well-formed but semantically invalid."""
