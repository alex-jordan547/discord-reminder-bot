"""
Tests de régression et compatibilité Python pour Discord Reminder Bot
"""
import sys
import asyncio
import warnings
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestPythonCompatibility:
    """Tests de compatibilité entre les versions Python"""

    def test_python_version_support(self):
        """Test que la version Python est supportée"""
        major, minor = sys.version_info[:2]
        
        # Versions supportées selon CLAUDE.md: 3.11, 3.12, 3.13
        supported_versions = [(3, 11), (3, 12), (3, 13)]
        
        assert (major, minor) in supported_versions, f"Python {major}.{minor} n'est pas supporté"

    def test_required_modules_import(self):
        """Test que tous les modules requis peuvent être importés"""
        required_modules = [
            'discord',
            'asyncio', 
            'json',
            'sqlite3',
            'pathlib',
            'logging',
            'os',
            'time',
            'typing',
            'dataclasses'
        ]
        
        failed_imports = []
        
        for module in required_modules:
            try:
                __import__(module)
            except ImportError as e:
                failed_imports.append((module, str(e)))
        
        assert not failed_imports, f"Modules manquants: {failed_imports}"

    def test_python_313_audioop_compatibility(self):
        """Test spécial pour Python 3.13 - compatibilité audioop-lts"""
        if sys.version_info[:2] == (3, 13):
            try:
                import audioop
                # Tester une fonction basique d'audioop
                sample_data = b'\x00\x01\x00\x02' * 1000
                rms = audioop.rms(sample_data, 2)
                assert isinstance(rms, int)
            except ImportError:
                pytest.fail("audioop-lts requis pour Python 3.13 mais non installé")

    def test_asyncio_compatibility(self):
        """Test de compatibilité asyncio entre versions"""
        # Test des fonctionnalités asyncio utilisées par le bot
        
        async def test_coroutine():
            await asyncio.sleep(0.001)
            return "test"
        
        # Test de base
        if sys.version_info >= (3, 7):
            result = asyncio.run(test_coroutine())
            assert result == "test"
        
        # Test create_task (disponible depuis 3.7)
        async def test_create_task():
            task = asyncio.create_task(test_coroutine())
            result = await task
            return result
        
        result = asyncio.run(test_create_task())
        assert result == "test"

    def test_typing_annotations_compatibility(self):
        """Test de compatibilité des annotations de type"""
        from typing import Dict, List, Optional, Union, Any
        
        # Test des annotations utilisées dans le projet
        def test_function(
            param1: str,
            param2: Optional[int] = None,
            param3: List[Dict[str, Any]] = None
        ) -> Union[str, None]:
            return param1 if param2 else None
        
        # Vérifier que les annotations sont disponibles
        annotations = test_function.__annotations__
        assert 'param1' in annotations
        assert 'return' in annotations

    def test_dataclass_compatibility(self):
        """Test de compatibilité des dataclasses"""
        from dataclasses import dataclass, field
        from typing import List
        
        @dataclass
        class TestEvent:
            message_id: str
            users: List[str] = field(default_factory=list)
            is_active: bool = True
        
        # Test création et utilisation
        event = TestEvent(message_id="test")
        assert event.message_id == "test"
        assert event.users == []
        assert event.is_active is True
        
        # Test with users
        event_with_users = TestEvent("test2", ["user1", "user2"])
        assert len(event_with_users.users) == 2

    def test_pathlib_compatibility(self):
        """Test de compatibilité pathlib"""
        from pathlib import Path
        
        # Test des opérations pathlib utilisées
        test_path = Path("test_file.txt")
        
        # Méthodes utilisées dans le projet
        assert hasattr(test_path, 'exists')
        assert hasattr(test_path, 'read_text')
        assert hasattr(test_path, 'write_text')
        assert hasattr(test_path, 'parent')
        assert hasattr(test_path, 'name')

    def test_json_compatibility(self):
        """Test de compatibilité JSON"""
        import json
        
        # Test des opérations JSON utilisées dans le projet
        test_data = {
            "message_id": "123",
            "users_who_reacted": ["user1", "user2"],
            "reminder_interval_hours": 24.0,
            "is_active": True,
            "created_at": 1234567890.0
        }
        
        # Serialization
        json_str = json.dumps(test_data)
        assert isinstance(json_str, str)
        
        # Deserialization
        loaded_data = json.loads(json_str)
        assert loaded_data == test_data

    def test_sqlite3_compatibility(self):
        """Test de compatibilité SQLite3"""
        import sqlite3
        import tempfile
        import os
        
        # Test avec base temporaire
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name
        
        try:
            # Test des opérations SQLite utilisées
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Créer une table de test
            cursor.execute('''
                CREATE TABLE test_events (
                    id INTEGER PRIMARY KEY,
                    message_id TEXT NOT NULL,
                    data TEXT
                )
            ''')
            
            # Insert
            cursor.execute(
                'INSERT INTO test_events (message_id, data) VALUES (?, ?)',
                ('test_msg', '{"test": true}')
            )
            
            # Select
            cursor.execute('SELECT * FROM test_events')
            results = cursor.fetchall()
            
            assert len(results) == 1
            assert results[0][1] == 'test_msg'
            
            conn.commit()
            conn.close()
            
        finally:
            # Cleanup
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_logging_compatibility(self):
        """Test de compatibilité du module logging"""
        import logging
        from io import StringIO
        
        # Test du logging utilisé dans le projet
        log_stream = StringIO()
        handler = logging.StreamHandler(log_stream)
        
        logger = logging.getLogger('test_logger')
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        
        # Test tous les niveaux utilisés
        logger.debug('Debug message')
        logger.info('Info message') 
        logger.warning('Warning message')
        logger.error('Error message')
        logger.critical('Critical message')
        
        log_output = log_stream.getvalue()
        assert 'Debug message' in log_output
        assert 'Info message' in log_output
        assert 'Warning message' in log_output
        assert 'Error message' in log_output
        assert 'Critical message' in log_output

    def test_discord_py_compatibility(self):
        """Test de compatibilité avec discord.py"""
        try:
            import discord
            from discord.ext import commands
            
            # Vérifier la version discord.py
            version_info = discord.version_info
            assert version_info.major >= 2, "discord.py 2.x requis"
            
            # Test création d'un bot (sans connexion)
            intents = discord.Intents.default()
            bot = commands.Bot(command_prefix='!', intents=intents)
            
            assert isinstance(bot, commands.Bot)
            assert bot.command_prefix == '!'
            
        except ImportError:
            pytest.skip("discord.py non installé pour ce test")

    @pytest.mark.asyncio
    async def test_async_context_managers_compatibility(self):
        """Test de compatibilité des context managers async"""
        
        class AsyncTestContext:
            def __init__(self):
                self.entered = False
                self.exited = False
            
            async def __aenter__(self):
                self.entered = True
                return self
            
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                self.exited = True
                return False
        
        # Test utilisation
        async with AsyncTestContext() as ctx:
            assert ctx.entered is True
            assert ctx.exited is False
        
        assert ctx.exited is True

    def test_exception_handling_compatibility(self):
        """Test de compatibilité de la gestion d'exceptions"""
        # Test des patterns d'exceptions utilisés dans le projet
        
        # Test exception chaining (disponible depuis 3.0)
        try:
            try:
                raise ValueError("Original error")
            except ValueError as e:
                raise RuntimeError("Wrapped error") from e
        except RuntimeError as e:
            assert e.__cause__ is not None
            assert isinstance(e.__cause__, ValueError)

    def test_f_string_compatibility(self):
        """Test de compatibilité des f-strings"""
        # f-strings introduites en Python 3.6
        name = "test"
        value = 42
        
        formatted = f"Name: {name}, Value: {value}"
        assert formatted == "Name: test, Value: 42"
        
        # Test avec expressions
        numbers = [1, 2, 3, 4, 5]
        result = f"Sum: {sum(numbers)}"
        assert result == "Sum: 15"

    def test_walrus_operator_compatibility(self):
        """Test de compatibilité de l'opérateur walrus (:=)"""
        # Walrus operator introduit en Python 3.8
        if sys.version_info >= (3, 8):
            # Test simple
            data = [1, 2, 3, 4, 5]
            if (n := len(data)) > 3:
                assert n == 5
            
            # Test dans une boucle
            values = []
            i = 0
            while (i := i + 1) <= 3:
                values.append(i)
            assert values == [1, 2, 3]


class TestRegressionScenarios:
    """Tests de régression pour éviter les régressions connues"""

    def test_unicode_handling_regression(self):
        """Test de non-régression pour la gestion Unicode"""
        # Test avec des noms de serveurs/canaux Unicode
        unicode_strings = [
            "Test Channel 🔥",
            "Café Discussion",
            "游戏频道",
            "🎮Gaming",
            "Тест канал"
        ]
        
        for s in unicode_strings:
            # Test encoding/decoding
            encoded = s.encode('utf-8')
            decoded = encoded.decode('utf-8')
            assert decoded == s
            
            # Test JSON serialization
            import json
            json_str = json.dumps({"name": s})
            loaded = json.loads(json_str)
            assert loaded["name"] == s

    def test_timezone_handling_regression(self):
        """Test de non-régression pour la gestion des fuseaux horaires"""
        import time
        from datetime import datetime, timezone
        
        # Test avec différents timestamps
        current_time = time.time()
        
        # Vérifier que time.time() retourne un float
        assert isinstance(current_time, float)
        
        # Test conversion datetime
        dt = datetime.fromtimestamp(current_time, tz=timezone.utc)
        assert isinstance(dt, datetime)
        assert dt.tzinfo is not None

    def test_file_path_handling_regression(self):
        """Test de non-régression pour la gestion des chemins de fichiers"""
        from pathlib import Path
        
        # Test avec différents types de chemins
        paths_to_test = [
            "data/events.json",
            "./logs/bot.log",
            "../config/settings.py",
            "data\\events.json",  # Windows style
        ]
        
        for path_str in paths_to_test:
            path = Path(path_str)
            
            # Vérifier que Path gère correctement
            assert isinstance(path.name, str)
            assert isinstance(path.parent, Path)
            assert isinstance(path.suffix, str)

    def test_async_await_regression(self):
        """Test de non-régression pour async/await"""
        
        async def test_async_function():
            await asyncio.sleep(0.001)
            return "completed"
        
        async def test_async_with_exception():
            await asyncio.sleep(0.001)
            raise ValueError("Test exception")
        
        # Test normal flow
        result = asyncio.run(test_async_function())
        assert result == "completed"
        
        # Test exception handling
        with pytest.raises(ValueError):
            asyncio.run(test_async_with_exception())

    def test_memory_leak_regression(self):
        """Test de non-régression pour les fuites mémoire"""
        import gc
        import weakref
        
        class TestObject:
            def __init__(self, data):
                self.data = data
        
        # Créer des objets et s'assurer qu'ils sont collectés
        objects = []
        weak_refs = []
        
        for i in range(100):
            obj = TestObject(f"data_{i}")
            objects.append(obj)
            weak_refs.append(weakref.ref(obj))
        
        # Vérifier que tous les objets existent
        assert all(ref() is not None for ref in weak_refs)
        
        # Supprimer les références
        del objects
        gc.collect()
        
        # Vérifier que les objets ont été collectés
        assert all(ref() is None for ref in weak_refs)

    def test_import_optimization_regression(self):
        """Test de non-régression pour l'optimisation des imports"""
        import sys
        
        # Vérifier que les modules ne sont importés qu'une fois
        initial_modules = set(sys.modules.keys())
        
        # Import du même module plusieurs fois
        import json as json1
        import json as json2
        import json as json3
        
        # Vérifier qu'ils pointent vers le même objet
        assert json1 is json2 is json3
        
        # Vérifier qu'aucun module supplémentaire n'a été ajouté
        final_modules = set(sys.modules.keys())
        new_modules = final_modules - initial_modules
        
        # Seul 'json' devrait potentiellement être nouveau
        assert len(new_modules) <= 1

    @pytest.mark.asyncio
    async def test_concurrent_access_regression(self):
        """Test de non-régression pour l'accès concurrent"""
        import threading
        
        shared_data = {"counter": 0}
        lock = threading.Lock()
        errors = []
        
        def increment_counter():
            try:
                for _ in range(100):
                    with lock:
                        current = shared_data["counter"]
                        # Simuler un petit délai
                        import time
                        time.sleep(0.0001)
                        shared_data["counter"] = current + 1
            except Exception as e:
                errors.append(e)
        
        # Lancer plusieurs threads
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=increment_counter)
            threads.append(thread)
            thread.start()
        
        # Attendre la fin
        for thread in threads:
            thread.join()
        
        # Vérifier qu'il n'y a pas d'erreurs
        assert not errors, f"Erreurs de concurrence: {errors}"
        
        # Vérifier le résultat attendu
        assert shared_data["counter"] == 500  # 5 threads * 100 incréments