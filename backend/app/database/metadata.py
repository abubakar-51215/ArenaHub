"""Single import point that registers every model on ``Base.metadata``.

Alembic's autogenerate and SQLAlchemy's string-based relationship resolution
both need all models imported before use. Import new module models here as
they are added.
"""

from app.database.base import Base

# Import for side effects: registers tables/mappers on Base.metadata.
from app.modules.arena import model as _arena  # noqa: F401
from app.modules.auth import model as _auth  # noqa: F401
from app.modules.booking import model as _booking  # noqa: F401
from app.modules.court import model as _court  # noqa: F401
from app.modules.equipment import model as _equipment  # noqa: F401
from app.modules.match import model as _match  # noqa: F401
from app.modules.payment import model as _payment  # noqa: F401
from app.modules.review import model as _review  # noqa: F401
from app.modules.slot import model as _slot  # noqa: F401
from app.modules.user import model as _user  # noqa: F401

target_metadata = Base.metadata
