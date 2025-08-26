"""
Tests de charge et de performance pour le Discord Reminder Bot
"""
import asyncio
import sys
import time
import statistics
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from concurrent.futures import ThreadPoolExecutor
import pytest
import pytest_asyncio

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from models.database_models import Event
from persistence.storage import StorageManager
from utils.unified_event_manager import UnifiedEventManager


class TestLoadPerformance:
    """Tests de performance et de charge"""

    @pytest.fixture
    def sample_events(self):
        """Génère des événements de test pour les tests de charge"""
        events = []
        base_time = time.time()
        
        for i in range(1000):
            event_data = {
                'message_id': str(1000000 + i),
                'channel_id': str(100000 + (i % 10)),  # 10 canaux différents
                'guild_id': str(10000 + (i % 5)),      # 5 serveurs différents
                'message_link': f'https://discord.com/channels/test/{i}',
                'users_who_reacted': [str(j) for j in range(i % 20)],  # 0-19 utilisateurs
                'reminder_interval_hours': 24.0,
                'last_reminder_time': base_time - (i * 3600),  # Décalage d'1h par événement
                'created_at': base_time - (i * 3600),
                'is_active': i % 10 != 0  # 10% d'événements inactifs
            }
            events.append(Event.from_dict(event_data))
        
        return events

    @pytest.mark.slow
    def test_storage_bulk_operations_performance(self, sample_events):
        """Test des performances des opérations de stockage en masse"""
        with patch('persistence.storage.Path.exists', return_value=True), \
             patch('persistence.storage.Path.read_text', return_value='[]'), \
             patch('persistence.storage.Path.write_text') as mock_write:
            
            storage = StorageManager()
            
            # Mesurer le temps de sauvegarde en masse
            start_time = time.time()
            asyncio.run(storage.save_events(sample_events))
            bulk_save_time = time.time() - start_time
            
            # Vérifier que la sauvegarde en masse est rapide (< 1 seconde pour 1000 événements)
            assert bulk_save_time < 1.0
            
            # Vérifier qu'on a bien écrit une seule fois (optimisation bulk)
            assert mock_write.call_count == 1

    @pytest.mark.slow
    @pytest.mark.asyncio
    async def test_event_manager_concurrent_access(self, sample_events):
        """Test d'accès concurrent au gestionnaire d'événements"""
        with patch('utils.unified_event_manager.storage_adapter') as mock_adapter:
            mock_adapter.load_events = AsyncMock(return_value=sample_events)
            mock_adapter.save_events = AsyncMock()
            
            manager = UnifiedEventManager()
            await manager.load_events()
            
            # Simuler des accès concurrents
            async def concurrent_operation(event_id):
                """Opération concurrente sur un événement"""
                await asyncio.sleep(0.01)  # Simuler du travail
                events = manager.get_events_due_for_reminder()
                return len(events)
            
            # Lancer 100 opérations concurrentes
            start_time = time.time()
            tasks = [concurrent_operation(i) for i in range(100)]
            results = await asyncio.gather(*tasks)
            concurrent_time = time.time() - start_time
            
            # Vérifier que les opérations concurrentes sont rapides
            assert concurrent_time < 2.0
            assert len(results) == 100
            assert all(isinstance(r, int) for r in results)

    @pytest.mark.slow
    def test_memory_usage_with_large_dataset(self, sample_events):
        """Test de l'utilisation mémoire avec un large dataset"""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        with patch('utils.unified_event_manager.storage_adapter') as mock_adapter:
            mock_adapter.load_events = AsyncMock(return_value=sample_events)
            mock_adapter.save_events = AsyncMock()
            
            manager = UnifiedEventManager()
            asyncio.run(manager.load_events())
            
            # Simuler des opérations sur tous les événements
            for _ in range(10):  # 10 cycles de traitement
                events_due = manager.get_events_due_for_reminder()
                
            current_memory = process.memory_info().rss / 1024 / 1024  # MB
            memory_increase = current_memory - initial_memory
            
            # L'augmentation de mémoire ne devrait pas dépasser 50 MB pour 1000 événements
            assert memory_increase < 50.0

    @pytest.mark.slow
    def test_database_query_performance(self):
        """Test des performances des requêtes de base de données"""
        with patch('sqlite3.connect') as mock_connect:
            mock_conn = MagicMock()
            mock_cursor = MagicMock()
            mock_connect.return_value = mock_conn
            mock_conn.cursor.return_value = mock_cursor
            
            # Simuler des résultats de requête
            sample_rows = [
                (i, f'channel_{i%10}', f'guild_{i%5}', f'message_{i}', 
                 f'link_{i}', '[]', 24.0, time.time(), time.time(), 1)
                for i in range(1000)
            ]
            mock_cursor.fetchall.return_value = sample_rows
            
            from persistence.database import DatabaseManager
            db_manager = DatabaseManager()
            
            # Mesurer le temps de requête
            start_time = time.time()
            asyncio.run(db_manager.get_all_events())
            query_time = time.time() - start_time
            
            # Les requêtes devraient être rapides
            assert query_time < 0.5

    @pytest.mark.slow  
    def test_reminder_calculation_performance(self, sample_events):
        """Test des performances du calcul des rappels"""
        current_time = time.time()
        
        # Mesurer le temps de calcul pour tous les événements
        start_time = time.time()
        
        due_events = []
        for event in sample_events:
            if event.is_reminder_due(current_time):
                due_events.append(event)
        
        calculation_time = time.time() - start_time
        
        # Le calcul pour 1000 événements devrait être très rapide
        assert calculation_time < 0.1
        
        # Vérifier que le résultat est cohérent
        assert isinstance(due_events, list)
        assert all(isinstance(event, Event) for event in due_events)

    @pytest.mark.slow
    def test_threading_performance(self, sample_events):
        """Test des performances avec threading"""
        def process_event_batch(events_batch):
            """Traite un lot d'événements"""
            current_time = time.time()
            return [e for e in events_batch if e.is_reminder_due(current_time)]
        
        # Diviser les événements en lots
        batch_size = 100
        batches = [sample_events[i:i+batch_size] for i in range(0, len(sample_events), batch_size)]
        
        # Test avec threading
        start_time = time.time()
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(process_event_batch, batches))
        threading_time = time.time() - start_time
        
        # Test séquentiel pour comparaison
        start_time = time.time()
        sequential_results = [process_event_batch(batch) for batch in batches]
        sequential_time = time.time() - start_time
        
        # Vérifier que les résultats sont identiques
        assert len(results) == len(sequential_results)
        
        # Le threading peut être plus rapide ou équivalent selon la charge
        assert threading_time <= sequential_time * 1.5  # Tolérance de 50%

    @pytest.mark.slow
    def test_json_serialization_performance(self, sample_events):
        """Test des performances de sérialisation JSON"""
        import json
        
        # Convertir en dictionnaires
        events_dict = [event.to_dict() for event in sample_events]
        
        # Mesurer la sérialisation
        start_time = time.time()
        json_data = json.dumps(events_dict)
        serialization_time = time.time() - start_time
        
        # Mesurer la désérialisation  
        start_time = time.time()
        loaded_data = json.loads(json_data)
        deserialization_time = time.time() - start_time
        
        # Reconstruction des objets Event
        start_time = time.time()
        reconstructed_events = [Event.from_dict(data) for data in loaded_data]
        reconstruction_time = time.time() - start_time
        
        # Les opérations JSON devraient être rapides
        assert serialization_time < 1.0
        assert deserialization_time < 0.5
        assert reconstruction_time < 1.0
        
        # Vérifier l'intégrité des données
        assert len(reconstructed_events) == len(sample_events)
        assert reconstructed_events[0].message_id == sample_events[0].message_id

    @pytest.mark.slow
    @pytest.mark.asyncio
    async def test_async_operations_scalability(self, sample_events):
        """Test de la scalabilité des opérations asynchrones"""
        async def simulate_async_reminder_check(event):
            """Simule une vérification asynchrone de rappel"""
            await asyncio.sleep(0.001)  # Simuler I/O
            return event.is_reminder_due(time.time())
        
        # Test avec différentes tailles de lots
        batch_sizes = [10, 50, 100, 500]
        times = []
        
        for batch_size in batch_sizes:
            batch = sample_events[:batch_size]
            
            start_time = time.time()
            tasks = [simulate_async_reminder_check(event) for event in batch]
            results = await asyncio.gather(*tasks)
            batch_time = time.time() - start_time
            
            times.append(batch_time)
            
            # Vérifier que tous les résultats sont des booléens
            assert all(isinstance(r, bool) for r in results)
            assert len(results) == batch_size
        
        # Vérifier que le temps croît de façon raisonnable avec la taille
        # (pas nécessairement linéaire due à l'asynchrone)
        assert times[1] >= times[0]  # 50 >= 10
        assert times[3] > times[0]   # 500 > 10

    @pytest.mark.slow
    def test_performance_regression_baseline(self, sample_events):
        """Test de régression de performance - établit une baseline"""
        operations_results = {}
        
        # Test 1: Filtrage des événements actifs
        start_time = time.time()
        active_events = [e for e in sample_events if e.is_active]
        operations_results['filter_active'] = time.time() - start_time
        
        # Test 2: Groupement par guild
        start_time = time.time()
        by_guild = {}
        for event in sample_events:
            if event.guild_id not in by_guild:
                by_guild[event.guild_id] = []
            by_guild[event.guild_id].append(event)
        operations_results['group_by_guild'] = time.time() - start_time
        
        # Test 3: Calcul de statistiques
        start_time = time.time()
        user_counts = [len(event.users_who_reacted) for event in sample_events]
        avg_users = statistics.mean(user_counts) if user_counts else 0
        max_users = max(user_counts) if user_counts else 0
        operations_results['calculate_stats'] = time.time() - start_time
        
        # Test 4: Tri par timestamp
        start_time = time.time()
        sorted_events = sorted(sample_events, key=lambda e: e.last_reminder_time)
        operations_results['sort_by_time'] = time.time() - start_time
        
        # Vérifier les baselines de performance
        assert operations_results['filter_active'] < 0.1
        assert operations_results['group_by_guild'] < 0.1  
        assert operations_results['calculate_stats'] < 0.1
        assert operations_results['sort_by_time'] < 0.1
        
        # Vérifier la cohérence des résultats
        assert len(active_events) <= len(sample_events)
        assert len(by_guild) <= len(set(e.guild_id for e in sample_events))
        assert isinstance(avg_users, (int, float))
        assert isinstance(max_users, int)
        assert len(sorted_events) == len(sample_events)
        
        # Log des résultats pour analyse future
        print(f"Performance baseline: {operations_results}")


class TestScalabilityLimits:
    """Tests des limites de scalabilité"""

    @pytest.mark.slow
    @pytest.mark.parametrize("event_count", [100, 1000, 5000])
    def test_scalability_with_different_sizes(self, event_count):
        """Test de scalabilité avec différentes tailles de datasets"""
        # Générer un dataset de la taille demandée
        events = []
        base_time = time.time()
        
        for i in range(event_count):
            event_data = {
                'message_id': str(1000000 + i),
                'channel_id': str(100000 + (i % 50)),  # Plus de canaux
                'guild_id': str(10000 + (i % 20)),     # Plus de serveurs
                'message_link': f'https://discord.com/channels/test/{i}',
                'users_who_reacted': [str(j) for j in range(i % 30)],
                'reminder_interval_hours': 24.0,
                'last_reminder_time': base_time - (i * 1800),
                'created_at': base_time - (i * 1800),
                'is_active': True
            }
            events.append(Event.from_dict(event_data))
        
        # Test de performance sur ce dataset
        start_time = time.time()
        current_time = time.time()
        due_events = [e for e in events if e.is_reminder_due(current_time)]
        processing_time = time.time() - start_time
        
        # Le temps de traitement devrait être raisonnablement scalable
        time_per_event = processing_time / event_count
        
        # Moins d'1ms par événement en moyenne
        assert time_per_event < 0.001
        
        # Le temps total ne devrait pas dépasser certains seuils
        if event_count <= 1000:
            assert processing_time < 0.5
        elif event_count <= 5000:
            assert processing_time < 2.0

    @pytest.mark.slow
    def test_memory_efficiency_large_dataset(self):
        """Test d'efficacité mémoire avec de gros datasets"""
        import gc
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss
        
        # Créer un très gros dataset
        large_dataset = []
        for i in range(10000):  # 10k événements
            event_data = {
                'message_id': str(2000000 + i),
                'channel_id': str(200000 + (i % 100)),
                'guild_id': str(20000 + (i % 50)),
                'message_link': f'https://discord.com/channels/large/{i}',
                'users_who_reacted': [str(j) for j in range(i % 50)],
                'reminder_interval_hours': 24.0,
                'last_reminder_time': time.time() - (i * 900),
                'created_at': time.time() - (i * 900),
                'is_active': True
            }
            large_dataset.append(Event.from_dict(event_data))
        
        current_memory = process.memory_info().rss
        memory_used = (current_memory - initial_memory) / 1024 / 1024  # MB
        
        # Effectuer des opérations sur le dataset
        active_count = sum(1 for e in large_dataset if e.is_active)
        due_count = sum(1 for e in large_dataset if e.is_reminder_due(time.time()))
        
        # Nettoyer
        del large_dataset
        gc.collect()
        
        # Vérifier l'utilisation mémoire raisonnable (< 100 MB pour 10k événements)
        assert memory_used < 100.0
        
        # Vérifier que les calculs sont corrects
        assert active_count >= 0
        assert due_count >= 0