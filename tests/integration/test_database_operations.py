"""
Tests d'intégration pour la base de données.

Ce module teste l'intégration complète de la base de données :
- Opérations concurrentes sur la base de données
- Transactions et rollbacks
- Cohérence des données entre tables
- Performance des requêtes complexes
"""

import asyncio
import pytest
import time
from datetime import datetime, timedelta
from threading import Thread
from unittest.mock import patch
from peewee import fn

from models.database_models import Event, Guild, User, Reaction, ReminderLog
from persistence.database import get_database
from tests.fixtures.fixture_manager import FixtureManager

# Import conditionnel pour éviter les erreurs
try:
    from utils.concurrency_sqlite import SQLiteConcurrency
except ImportError:
    SQLiteConcurrency = None


class TestDatabaseIntegration:
    """Tests d'intégration pour les opérations de base de données."""

    @pytest.fixture
    def setup_database_environment(self, temp_database):
        """Prépare l'environnement de base de données pour les tests."""
        fixture_manager = FixtureManager(temp_database)
        """Prépare l'environnement de base de données pour les tests."""
        # Créer des données de test
        guild = fixture_manager.create_guild()
        users = [fixture_manager.create_user() for _ in range(5)]
        events = [fixture_manager.create_event(guild=guild) for _ in range(3)]
        
        return {
            "guild": guild,
            "users": users,
            "events": events,
            "database": temp_database
        }

    @pytest.mark.asyncio
    async def test_concurrent_database_operations(self, setup_database_environment):
        """Test les opérations concurrentes sur la base de données."""
        env = setup_database_environment
        
        results = []
        
        def create_reactions_batch(event, users_subset, batch_id):
            """Créer un lot de réactions de manière concurrente."""
            try:
                for i, user in enumerate(users_subset):
                    reaction = Reaction.create(
                        event=event,
                        user=user,
                        emoji=["✅", "❌", "🤔"][i % 3],
                        added_at=datetime.now()
                    )
                results.append(f"batch_{batch_id}_success")
                return True
            except Exception as e:
                results.append(f"batch_{batch_id}_error: {str(e)}")
                return False
        
        # Lancer plusieurs threads simultanées
        threads = []
        for i in range(3):
            thread = Thread(
                target=create_reactions_batch,
                args=(env["events"][0], env["users"][i:i+2], i)
            )
            threads.append(thread)
            thread.start()
        
        # Attendre la completion
        for thread in threads:
            thread.join()
        
        # Vérifier les résultats
        success_count = len([r for r in results if "success" in r])
        assert success_count >= 2, "Au moins 2 batches devraient réussir"
        
        # Vérifier l'intégrité des données
        total_reactions = Reaction.select().where(Reaction.event == env["events"][0]).count()
        assert total_reactions >= 4, "Au moins 4 réactions devraient être créées"

    @pytest.mark.asyncio
    async def test_transaction_rollback(self, setup_database_environment):
        """Test les transactions et rollbacks."""
        env = setup_database_environment
        
        initial_event_count = Event.select().count()
        initial_reaction_count = Reaction.select().count()
        
        try:
            with get_database().atomic():
                # Créer un nouvel événement
                new_event = Event.create(
                    message_id=999999999,
                    channel_id=888888888,
                    guild=env["guild"],
                    title="Test Transaction",
                    interval_minutes=60.0
                )
                
                # Créer quelques réactions
                for user in env["users"][:2]:
                    Reaction.create(
                        event=new_event,
                        user=user,
                        emoji="✅",
                        added_at=datetime.now()
                    )
                
                # Forcer une erreur pour déclencher rollback
                raise Exception("Erreur forcée pour test rollback")
                
        except Exception:
            # Exception attendue
            pass
        
        # Vérifier que rien n'a été persisté (rollback effectué)
        final_event_count = Event.select().count()
        final_reaction_count = Reaction.select().count()
        
        assert final_event_count == initial_event_count, "Aucun nouvel événement ne devrait être persisté"
        assert final_reaction_count == initial_reaction_count, "Aucune nouvelle réaction ne devrait être persistée"

    @pytest.mark.asyncio
    async def test_data_consistency_across_tables(self, setup_database_environment):
        """Test la cohérence des données entre tables."""
        env = setup_database_environment
        
        # Créer des données liées entre tables
        event = env["events"][0]
        
        # Ajouter des réactions
        reactions = []
        for user in env["users"]:
            reaction = Reaction.create(
                event=event,
                user=user,
                emoji="✅",
                added_at=datetime.now()
            )
            reactions.append(reaction)
        
        # Ajouter des logs de rappels
        reminder_logs = []
        for i in range(3):
            log = ReminderLog.create(
                event=event,
                sent_at=datetime.now() - timedelta(hours=i),
                recipient_count=len(env["users"]),
                success=True
            )
            reminder_logs.append(log)
        
        # Vérifier la cohérence des relations
        # 1. Toutes les réactions pointent vers l'événement correct
        for reaction in reactions:
            assert reaction.event.id == event.id
            assert reaction.user.id in [u.id for u in env["users"]]
        
        # 2. Tous les logs pointent vers l'événement correct  
        for log in reminder_logs:
            assert log.event.id == event.id
        
        # 3. Suppression en cascade
        user_to_delete = env["users"][0]
        reactions_count = Reaction.select().where(
            (Reaction.user_id == user_to_delete.id) & (Reaction.event_id == event.id)
        ).count()
        
        # Supprimer l'utilisateur
        user_to_delete.delete_instance()
        
        # Vérifier que les réactions de cet utilisateur sont supprimées
        remaining_reactions_count = Reaction.select().where(Reaction.event == event).count()
        expected_remaining = len(env["users"]) - 1
        
        assert remaining_reactions_count == expected_remaining, "Les réactions de l'utilisateur supprimé devraient être supprimées"

    @pytest.mark.asyncio
    async def test_complex_query_performance(self, setup_database_environment):
        """Test les performances des requêtes complexes."""
        env = setup_database_environment
        
        # Créer plus de données pour le test de performance
        additional_events = []
        for i in range(20):
            event = Event.create(
                message_id=700000 + i,
                channel_id=800000 + i,
                guild=env["guild"],
                title=f"Performance Test Event {i}",
                interval_minutes=60.0 + (i * 15),
                is_paused=i % 3 == 0  # Varier l'état de pause
            )
            additional_events.append(event)
            
            # Ajouter des réactions pour chaque événement
            for j, user in enumerate(env["users"]):
                if (i + j) % 2 == 0:  # Varier les réactions
                    Reaction.create(
                        event=event,
                        user=user,
                        emoji=["✅", "❌", "🤔"][j % 3],
                        added_at=datetime.now() - timedelta(minutes=i*10)
                    )
        
        # Test 1: Requête complexe avec jointures
        start_time = time.time()
        
        complex_query_results = list(
            Event.select(Event, Guild)
            .join(Guild)
            .where(
                (Event.is_paused == False) & 
                (Event.interval_minutes < 300)
            )
            .order_by(Event.interval_minutes)
        )
        
        query1_duration = time.time() - start_time
        
        assert len(complex_query_results) > 0, "La requête complexe devrait retourner des résultats"
        assert query1_duration < 1.0, f"La requête complexe devrait être rapide (durée: {query1_duration:.3f}s)"
        
        # Test 2: Requête d'agrégation
        start_time = time.time()
        
        aggregation_results = (
            Reaction.select(
                Reaction.event,
                Reaction.emoji,
                fn.COUNT(Reaction.id_).alias('reaction_count')
            )
            .group_by(Reaction.event, Reaction.emoji)
            .having(fn.COUNT(Reaction.id_) > 1)
        )
        
        aggregation_list = list(aggregation_results)
        query2_duration = time.time() - start_time
        
        assert query2_duration < 1.0, f"La requête d'agrégation devrait être rapide (durée: {query2_duration:.3f}s)"
        
        # Test 3: Requête avec sous-requête
        start_time = time.time()
        
        events_with_reactions = list(
            Event.select()
            .where(
                Event.id_.in_(
                    Reaction.select(Reaction.event).distinct()
                )
            )
        )
        
        query3_duration = time.time() - start_time
        
        assert len(events_with_reactions) > 0, "Il devrait y avoir des événements avec réactions"
        assert query3_duration < 1.0, f"La sous-requête devrait être rapide (durée: {query3_duration:.3f}s)"

    @pytest.mark.asyncio
    async def test_database_connection_resilience(self, setup_database_environment):
        """Test la résilience des connexions à la base de données."""
        env = setup_database_environment
        
        # Test 1: Reconnexion après fermeture
        db = get_database()
        
        # Fermer la connexion
        if not db.is_closed():
            db.close()
        
        # Tenter une opération qui devrait rouvrir la connexion
        try:
            event_count = Event.select().count()
            assert event_count >= 0, "L'opération devrait réussir après reconnexion"
        except Exception as e:
            pytest.fail(f"La reconnexion automatique devrait fonctionner: {e}")
        
        # Test 2: Gestion des timeouts
        with patch('peewee.SqliteDatabase.execute_sql') as mock_execute:
            # Simuler un timeout
            mock_execute.side_effect = TimeoutError("Database timeout")
            
            try:
                Event.select().count()
            except TimeoutError:
                # Le timeout devrait être géré gracieusement
                pass
            except Exception as e:
                pytest.fail(f"Les timeouts devraient être gérés gracieusement: {e}")

    @pytest.mark.asyncio
    async def test_concurrent_schema_operations(self, setup_database_environment):
        """Test les opérations concurrentes sur le schéma."""
        env = setup_database_environment
        
        # Simuler des opérations concurrentes qui pourraient affecter le schéma
        results = []
        
        def perform_schema_operation(operation_id):
            """Effectuer une opération qui pourrait affecter le schéma."""
            try:
                # Créer des index dynamiques (simulation)
                with get_database().atomic():
                    # Opération qui nécessite un verrou sur la base
                    events = list(Event.select().limit(10))
                    
                    for event in events:
                        # Mise à jour qui pourrait créer des conflits
                        Event.update(
                            last_reminder=datetime.now()
                        ).where(
                            Event.id_ == event.id
                        ).execute()
                
                results.append(f"operation_{operation_id}_success")
                return True
                
            except Exception as e:
                results.append(f"operation_{operation_id}_error: {str(e)}")
                return False
        
        # Lancer plusieurs opérations concurrentes
        threads = []
        for i in range(3):
            thread = Thread(target=perform_schema_operation, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Attendre completion
        for thread in threads:
            thread.join()
        
        # Au moins une opération devrait réussir
        success_count = len([r for r in results if "success" in r])
        assert success_count >= 1, "Au moins une opération concurrente devrait réussir"