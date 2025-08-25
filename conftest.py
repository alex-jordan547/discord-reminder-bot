"""
Configuration pytest pour les tests du Discord Reminder Bot.
Ce fichier configure l'environnement de test et fournit des fixtures communes.
"""

import asyncio
import os
import tempfile
from pathlib import Path
from typing import AsyncGenerator, Generator

import pytest
from dotenv import load_dotenv

# Charger les variables d'environnement pour les tests
load_dotenv()

# Configuration des tests
os.environ["TEST_MODE"] = "true"
os.environ["SQLITE_STORAGE"] = "true"
os.environ["SQLITE_MIGRATION"] = "true"
os.environ["SQLITE_SCHEDULER"] = "true"
os.environ["SQLITE_CONCURRENCY"] = "true"
os.environ["SQLITE_MONITORING"] = "true"
os.environ["SQLITE_BACKUP"] = "true"
os.environ["LOG_LEVEL"] = "ERROR"  # Réduire les logs pendant les tests


@pytest.fixture(scope="session")
def event_loop():
    """Créer un event loop pour toute la session de tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def temp_database() -> AsyncGenerator[str, None]:
    """Créer une base de données temporaire pour chaque test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_file:
        db_path = tmp_file.name

    # Configurer la base de données temporaire
    os.environ["DATABASE_PATH"] = db_path

    try:
        # Initialiser la base de données
        from models.schema_manager import setup_database

        setup_database()

        yield db_path
    finally:
        # Nettoyer
        if os.path.exists(db_path):
            os.unlink(db_path)

        # Restaurer la configuration par défaut
        if "DATABASE_PATH" in os.environ:
            del os.environ["DATABASE_PATH"]


@pytest.fixture(scope="function")
async def clean_database():
    """Nettoyer la base de données avant chaque test."""
    from models.database_models import ALL_MODELS
    from persistence.database import get_database

    database = get_database()

    try:
        if database.is_closed():
            database.connect()

        # Vider toutes les tables
        for model in reversed(ALL_MODELS):
            if model.table_exists():
                model.delete().execute()

        yield database

    finally:
        if not database.is_closed():
            database.close()


@pytest.fixture(scope="function")
def mock_discord_objects():
    """Créer des objets Discord mockés pour les tests."""

    class MockRole:
        def __init__(self, name: str, id: int = None):
            self.name = name
            self.id = id or hash(name)

    class MockMember:
        def __init__(self, id: int, roles: list = None):
            self.id = id
            self.roles = [
                MockRole(role) if isinstance(role, str) else role for role in (roles or [])
            ]
            self.bot = False

    class MockChannel:
        def __init__(self, id: int, name: str = "test-channel"):
            self.id = id
            self.name = name

    class MockGuild:
        def __init__(self, id: int, name: str = "Test Guild"):
            self.id = id
            self.name = name
            self.members = []

    class MockMessage:
        def __init__(self, id: int, content: str = "", reactions: list = None):
            self.id = id
            self.content = content
            self.reactions = reactions or []

    return {
        "Role": MockRole,
        "Member": MockMember,
        "Channel": MockChannel,
        "Guild": MockGuild,
        "Message": MockMessage,
    }


@pytest.fixture(scope="function")
async def sample_event_data():
    """Données d'exemple pour créer des événements de test."""
    return {
        "message_id": 123456789012345678,
        "channel_id": 987654321098765432,
        "guild_id": 111222333444555666,
        "title": "Test Event",
        "description": "Événement de test",
        "interval_minutes": 60.0,
        "is_paused": False,
        "required_reactions": ["✅", "❌", "❓"],
    }


@pytest.fixture(scope="function")
async def initialized_event_manager():
    """Gestionnaire d'événements initialisé pour les tests."""
    from utils.unified_event_manager import unified_event_manager

    await unified_event_manager.initialize()
    yield unified_event_manager

    # Nettoyer après le test
    await unified_event_manager.cleanup()


@pytest.fixture(scope="function")
def temp_json_file() -> Generator[str, None, None]:
    """Créer un fichier JSON temporaire pour les tests."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp_file:
        json_path = tmp_file.name
        tmp_file.write("{}")  # Fichier JSON vide valide

    yield json_path

    # Nettoyer
    if os.path.exists(json_path):
        os.unlink(json_path)


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Configuration globale de l'environnement de test."""
    # Créer les dossiers nécessaires
    test_dirs = ["data", "logs", "tests/fixtures"]
    for dir_name in test_dirs:
        Path(dir_name).mkdir(parents=True, exist_ok=True)

    # Configuration des logs pour les tests
    import logging

    logging.getLogger().setLevel(logging.ERROR)

    yield

    # Nettoyer après tous les tests
    # (optionnel - les fichiers temporaires sont déjà nettoyés individuellement)


@pytest.fixture(scope="function")
def mock_bot():
    """Bot Discord mocké pour les tests."""

    class MockBot:
        def __init__(self):
            self.user = type("User", (), {"id": 123456789, "name": "TestBot"})()
            self.guilds = []

        def get_guild(self, guild_id: int):
            return next((g for g in self.guilds if g.id == guild_id), None)

        def get_channel(self, channel_id: int):
            return type("Channel", (), {"id": channel_id, "name": "test-channel"})()

    return MockBot()


# Marques pytest personnalisées
def pytest_configure(config):
    """Configuration des marques pytest."""
    config.addinivalue_line("markers", "unit: Tests unitaires")
    config.addinivalue_line("markers", "integration: Tests d'intégration")
    config.addinivalue_line("markers", "functional: Tests fonctionnels")
    config.addinivalue_line("markers", "slow: Tests lents")
    config.addinivalue_line("markers", "database: Tests nécessitant une base de données")
    config.addinivalue_line("markers", "discord: Tests nécessitant des objets Discord")


# Configuration des timeouts pour les tests async
@pytest.fixture(autouse=True)
def timeout_all_tests():
    """Timeout automatique pour tous les tests."""
    import signal

    def timeout_handler(signum, frame):
        pytest.fail("Test timeout - le test a pris trop de temps")

    # Timeout de 30 secondes par test
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(30)

    yield

    signal.alarm(0)  # Annuler le timeout
