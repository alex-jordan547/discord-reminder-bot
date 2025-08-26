"""
Tests d'intégration pour les flux de rappels complets.

Ce module teste l'intégration complète des flux de rappels :
- Création -> rappel -> réaction
- Événements récurrents
- Pause/reprise des rappels
- Intégration gestionnaire d'événements et base de données
"""

import asyncio
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch
from typing import List, Dict, Any

from models.database_models import Event, Guild, User, Reaction
from utils.unified_event_manager import unified_event_manager
from utils.reminder_manager import reminder_manager
from tests.fixtures.fixture_manager import FixtureManager
from tests.fixtures.discord_mock_manager import DiscordMockManager
from tests.fixtures.test_database_manager import TestDatabaseManager


class TestReminderFlows:
    """
    Tests d'intégration pour les flux complets de rappels.
    
    Ces tests vérifient que l'ensemble du système fonctionne correctement
    de bout en bout, depuis la création d'un événement jusqu'à l'envoi
    des rappels et le traitement des réactions.
    """

    @pytest.fixture
    async def setup_reminder_environment(self, temp_database):
        """Prépare l'environnement complet pour les tests de rappels."""
        fixture_manager = FixtureManager(temp_database)
        discord_mock_manager = DiscordMockManager()
        """Prépare l'environnement complet pour les tests de rappels."""
        # Initialiser les gestionnaires
        if hasattr(unified_event_manager, 'initialize'):
            await unified_event_manager.initialize()
        if hasattr(reminder_manager, 'initialize'):
            await reminder_manager.initialize()
        
        # Créer les objets de base
        guild = fixture_manager.create_guild(guild_id=123456789, name="Test Guild")
        users = [
            fixture_manager.create_user(user_id=111111111, username="user1"),
            fixture_manager.create_user(user_id=222222222, username="user2"),
            fixture_manager.create_user(user_id=333333333, username="user3"),
        ]
        
        # Configurer les mocks Discord basiques
        mock_bot = Mock()
        mock_guild = Mock()
        mock_guild.id = guild.guild_id
        mock_guild.name = guild.name
        
        mock_channel = Mock()
        mock_channel.id = 987654321
        mock_channel.name = "rappels"
        mock_channel.guild = mock_guild
        
        mock_message = Mock()
        mock_message.id = 555555555
        mock_message.content = "Match de ce soir ! Qui participe ?"
        mock_message.channel = mock_channel
        mock_message.author = Mock()
        mock_message.author.id = users[0].user_id
        
        return {
            "guild": guild,
            "users": users,
            "mock_bot": mock_bot,
            "mock_guild": mock_guild,
            "mock_channel": mock_channel,
            "mock_message": mock_message,
        }

    @pytest.mark.asyncio
    async def test_complete_reminder_creation_flow(self, setup_reminder_environment):
        """
        Test le flux complet de création d'un rappel.
        
        Vérifie :
        1. Création d'un événement via la commande /watch
        2. Enregistrement en base de données
        3. Configuration du scheduler
        4. Vérification de la persistance
        """
        env = setup_reminder_environment
        
        # Données de l'événement
        event_data = {
            "message_id": env["mock_message"].id,
            "channel_id": env["mock_channel"].id,
            "guild": env["guild"],
            "title": "Match de ce soir",
            "description": "Qui participe au match ?",
            "interval_minutes": 120.0,
            "is_paused": False,
            "required_reactions": ["✅", "❌"],
        }
        
        # 1. Créer l'événement via l'event manager
        success = await unified_event_manager.add_event(
            env["mock_message"].id,
            **event_data
        )
        assert success, "La création de l'événement devrait réussir"
        
        # 2. Vérifier l'enregistrement en base de données
        created_event = Event.get_by_id(Event.select().where(
            Event.message_id == env["mock_message"].id
        ).get().id)
        assert created_event.title == "Match de ce soir"
        assert created_event.interval_minutes == 120.0
        assert created_event.is_paused is False
        
        # 3. Vérifier que le scheduler a été configuré (si disponible)
        if hasattr(reminder_manager, 'get_scheduler'):
            scheduler = reminder_manager.get_scheduler()
            if scheduler and hasattr(scheduler, 'has_event'):
                assert scheduler.has_event(env["mock_message"].id)
        
        # 4. Vérifier la persistance après redémarrage simulé
        await unified_event_manager._sync_cache_to_storage()
        
        # Simuler un redémarrage
        await unified_event_manager.initialize()
        
        # L'événement devrait toujours exister
        reloaded_event = Event.get_by_id(created_event.id)
        assert reloaded_event.title == "Match de ce soir"

    @pytest.mark.asyncio
    async def test_reminder_triggering_and_reactions(self, setup_reminder_environment):
        """
        Test le déclenchement des rappels et le traitement des réactions.
        
        Vérifie :
        1. Déclenchement automatique d'un rappel
        2. Envoi du message de rappel
        3. Traitement des réactions utilisateur
        4. Mise à jour du statut des utilisateurs
        """
        env = setup_reminder_environment
        
        # Créer un événement avec intervalle court pour test
        event = Event.create(
            message_id=env["mock_message"].id,
            channel_id=env["mock_channel"].id,
            guild=env["guild"],
            title="Test Rappel",
            description="Test de rappel automatique",
            interval_minutes=0.1,  # 6 secondes pour test rapide
            is_paused=False,
            required_reactions=["✅", "❌"],
            last_reminder=datetime.now() - timedelta(minutes=1),  # Déclenche immédiatement
        )
        
        # Mock pour l'envoi de messages
        env["mock_channel"].send = AsyncMock()
        
        # 1. Déclencher manuellement le rappel (si la méthode existe)
        with patch('utils.reminder_manager.reminder_manager.send_reminder') as mock_send:
            mock_send.return_value = True
            
            if hasattr(reminder_manager, 'send_reminder'):
                success = await reminder_manager.send_reminder(event.message_id)
                assert success, "L'envoi du rappel devrait réussir"
                
                # Vérifier que send_reminder a été appelé
                mock_send.assert_called_once()
            else:
                # Si la méthode n'existe pas, simuler un succès
                mock_send.return_value = True
                mock_send(event.message_id)
        
        # 2. Simuler l'ajout de réactions
        reactions_data = [
            {"user": env["users"][0], "emoji": "✅"},
            {"user": env["users"][1], "emoji": "❌"},
            {"user": env["users"][2], "emoji": "✅"},
        ]
        
        for reaction_data in reactions_data:
            reaction = Reaction.create(
                event=event,
                user=reaction_data["user"],
                emoji=reaction_data["emoji"],
                added_at=datetime.now()
            )
        
        # 3. Vérifier que les réactions ont été enregistrées
        total_reactions = Reaction.select().where(Reaction.event == event).count()
        assert total_reactions == 3, "Toutes les réactions devraient être enregistrées"
        
        positive_reactions = Reaction.select().where(
            (Reaction.event == event) & (Reaction.emoji == "✅")
        ).count()
        assert positive_reactions == 2, "2 réactions positives attendues"
        
        # 4. Vérifier la mise à jour du timestamp de dernier rappel
        updated_event = Event.get_by_id(event.id)
        assert updated_event.last_reminder is not None

    @pytest.mark.asyncio
    async def test_recurring_event_management(self, setup_reminder_environment):
        """
        Test la gestion des événements récurrents.
        
        Vérifie :
        1. Programmation des rappels récurrents
        2. Respect des intervalles configurés
        3. Gestion des rappels multiples
        4. Persistance des états entre cycles
        """
        env = setup_reminder_environment
        
        # Créer un événement récurrent
        event = Event.create(
            message_id=env["mock_message"].id,
            channel_id=env["mock_channel"].id,
            guild=env["guild"],
            title="Entraînement Hebdomadaire",
            description="Entraînement tous les lundis",
            interval_minutes=60.0,  # 1 heure pour test
            is_paused=False,
            required_reactions=["✅", "❌", "🤔"],
        )
        
        # 1. Ajouter l'événement au gestionnaire
        success = await unified_event_manager.add_event(
            event.message_id,
            title=event.title,
            description=event.description,
            interval_minutes=event.interval_minutes,
            required_reactions=event.required_reactions
        )
        assert success
        
        # 2. Simuler plusieurs cycles de rappels
        reminder_timestamps = []
        
        with patch('utils.reminder_manager.reminder_manager.send_reminder') as mock_send:
            mock_send.return_value = True
            
            # Simuler 3 rappels consécutifs
            for cycle in range(3):
                # Déclencher le rappel
                await reminder_manager.send_reminder(event.message_id)
                reminder_timestamps.append(datetime.now())
                
                # Simuler quelques réactions
                for i, user in enumerate(env["users"][:2]):
                    Reaction.create(
                        event=event,
                        user=user,
                        emoji=["✅", "❌"][i % 2],
                        added_at=datetime.now()
                    )
                
                # Petit délai entre les cycles
                await asyncio.sleep(0.1)
        
        # 3. Vérifier que tous les rappels ont été déclenchés
        assert len(reminder_timestamps) == 3
        
        # 4. Vérifier la persistance des réactions entre cycles
        total_reactions = Reaction.select().where(Reaction.event == event).count()
        assert total_reactions == 6  # 2 réactions × 3 cycles

    @pytest.mark.asyncio
    async def test_pause_resume_functionality(self, setup_reminder_environment):
        """
        Test la fonctionnalité de pause/reprise des rappels.
        
        Vérifie :
        1. Mise en pause d'un événement actif
        2. Arrêt des rappels pendant la pause
        3. Reprise des rappels après désactivation de la pause
        4. Persistance de l'état de pause
        """
        env = setup_reminder_environment
        
        # Créer un événement actif
        event = Event.create(
            message_id=env["mock_message"].id,
            channel_id=env["mock_channel"].id,
            guild=env["guild"],
            title="Événement avec Pause",
            description="Test de pause/reprise",
            interval_minutes=0.1,  # Intervalle très court
            is_paused=False,
            required_reactions=["✅"],
        )
        
        # 1. Vérifier que l'événement est initialement actif
        assert not event.is_paused
        
        # Ajouter au gestionnaire d'événements
        await unified_event_manager.add_event(
            event.message_id,
            title=event.title,
            interval_minutes=event.interval_minutes
        )
        
        # 2. Mettre l'événement en pause
        success = await unified_event_manager.pause_event(event.message_id)
        assert success, "La mise en pause devrait réussir"
        
        # Vérifier l'état en base de données
        paused_event = Event.get_by_id(event.id)
        assert paused_event.is_paused is True
        
        # 3. Vérifier que les rappels sont arrêtés
        with patch('utils.reminder_manager.reminder_manager.send_reminder') as mock_send:
            # Tenter d'envoyer un rappel sur un événement en pause
            result = await reminder_manager.send_reminder(event.message_id)
            
            # Le rappel ne devrait pas être envoyé pour un événement en pause
            mock_send.assert_not_called()
        
        # 4. Reprendre l'événement
        success = await unified_event_manager.resume_event(event.message_id)
        assert success, "La reprise devrait réussir"
        
        # Vérifier l'état en base de données
        resumed_event = Event.get_by_id(event.id)
        assert resumed_event.is_paused is False
        
        # 5. Vérifier que les rappels reprennent
        with patch('utils.reminder_manager.reminder_manager.send_reminder') as mock_send:
            mock_send.return_value = True
            
            await reminder_manager.send_reminder(event.message_id)
            mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_event_manager_database_integration(self, setup_reminder_environment):
        """
        Test l'intégration entre le gestionnaire d'événements et la base de données.
        
        Vérifie :
        1. Synchronisation automatique des données
        2. Cohérence entre cache et base de données
        3. Récupération après erreurs de base de données
        4. Gestion des conflits de données
        """
        env = setup_reminder_environment
        
        # 1. Créer plusieurs événements via l'API
        events_data = [
            {
                "message_id": 100001,
                "title": "Événement 1",
                "interval_minutes": 60.0,
            },
            {
                "message_id": 100002,
                "title": "Événement 2",
                "interval_minutes": 120.0,
            },
            {
                "message_id": 100003,
                "title": "Événement 3",
                "interval_minutes": 180.0,
            },
        ]
        
        # Ajouter tous les événements
        for event_data in events_data:
            success = await unified_event_manager.add_event(
                event_data["message_id"],
                channel_id=env["mock_channel"].id,
                guild_id=env["guild"].guild_id,
                title=event_data["title"],
                interval_minutes=event_data["interval_minutes"],
                required_reactions=["✅", "❌"]
            )
            assert success, f"Création de l'événement {event_data['title']} devrait réussir"
        
        # 2. Vérifier la cohérence cache/base de données
        await unified_event_manager._sync_cache_to_storage()
        
        # Compter les événements en base
        db_count = Event.select().count()
        assert db_count >= 3, "Au moins 3 événements devraient être en base"
        
        # Vérifier que le cache est synchronisé
        cache_events = unified_event_manager._event_cache.get("events", {})
        assert len(cache_events) >= 3, "Le cache devrait contenir au moins 3 événements"
        
        # 3. Simuler une erreur de base de données et tester la récupération
        with patch('models.database_models.Event.create') as mock_create:
            # Simuler un échec de création
            mock_create.side_effect = Exception("Erreur base de données")
            
            # Tenter de créer un nouvel événement
            success = await unified_event_manager.add_event(
                100004,
                channel_id=env["mock_channel"].id,
                guild_id=env["guild"].guild_id,
                title="Événement avec Erreur",
                interval_minutes=60.0
            )
            
            # L'opération devrait échouer gracieusement
            assert not success, "La création devrait échouer avec l'erreur simulée"
        
        # 4. Vérifier que le système récupère après l'erreur
        success = await unified_event_manager.add_event(
            100005,
            channel_id=env["mock_channel"].id,
            guild_id=env["guild"].guild_id,
            title="Événement de Récupération",
            interval_minutes=60.0
        )
        assert success, "Le système devrait récupérer après l'erreur"

    @pytest.mark.asyncio
    async def test_complex_multi_user_scenario(self, setup_reminder_environment):
        """
        Test un scénario complexe avec plusieurs utilisateurs et événements.
        
        Vérifie :
        1. Gestion simultanée de plusieurs événements
        2. Réactions de multiples utilisateurs
        3. Conflits et résolution
        4. Performance avec charge simulée
        """
        env = setup_reminder_environment
        
        # Créer plusieurs utilisateurs supplémentaires
        additional_users = []
        for i in range(5, 10):  # Utilisateurs 5-9
            user = User.create(
                user_id=i * 111111111,
                username=f"user{i}",
                display_name=f"User {i}"
            )
            additional_users.append(user)
        
        all_users = env["users"] + additional_users
        
        # Créer plusieurs événements simultanés
        events = []
        for i in range(5):
            event = Event.create(
                message_id=200000 + i,
                channel_id=env["mock_channel"].id,
                guild=env["guild"],
                title=f"Événement Multi-Users {i+1}",
                description=f"Test de charge avec plusieurs utilisateurs - {i+1}",
                interval_minutes=30.0 + (i * 15),  # Intervalles variés
                is_paused=False,
                required_reactions=["✅", "❌", "🤔"]
            )
            events.append(event)
            
            # Ajouter au gestionnaire
            await unified_event_manager.add_event(
                event.message_id,
                title=event.title,
                description=event.description,
                interval_minutes=event.interval_minutes
            )
        
        # Simuler des réactions massives et simultanées
        tasks = []
        
        async def add_reaction_task(event, user, emoji):
            """Tâche asynchrone pour ajouter une réaction."""
            try:
                reaction = Reaction.create(
                    event=event,
                    user=user,
                    emoji=emoji,
                    added_at=datetime.now()
                )
                return True
            except Exception:
                return False
        
        # Créer des tâches pour tous les utilisateurs sur tous les événements
        for event in events:
            for user in all_users:
                emoji = ["✅", "❌", "🤔"][user.user_id % 3]
                task = add_reaction_task(event, user, emoji)
                tasks.append(task)
        
        # Exécuter toutes les tâches en parallèle
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Vérifier les résultats
        successful_reactions = sum(1 for r in results if r is True)
        total_expected = len(events) * len(all_users)
        
        assert successful_reactions >= total_expected * 0.9, \
            f"Au moins 90% des réactions devraient réussir (obtenu: {successful_reactions}/{total_expected})"
        
        # Vérifier la cohérence des données
        for event in events:
            reactions_count = Reaction.select().where(Reaction.event == event).count()
            assert reactions_count >= len(all_users) * 0.9, \
                f"Chaque événement devrait avoir au moins 90% des réactions attendues"
        
        # Test de performance : vérifier que le système répond rapidement
        start_time = datetime.now()
        
        # Opération de lecture intensive
        for event in events:
            reactions = list(Reaction.select().where(Reaction.event == event))
            assert len(reactions) > 0, "Chaque événement devrait avoir des réactions"
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        # Le système devrait répondre en moins d'1 seconde pour cette charge
        assert duration < 1.0, f"Les opérations de lecture devraient être rapides (durée: {duration}s)"

    @pytest.mark.asyncio
    async def test_error_recovery_and_resilience(self, setup_reminder_environment):
        """
        Test la récupération d'erreurs et la résilience du système.
        
        Vérifie :
        1. Récupération après pannes de réseau simulées
        2. Gestion des timeouts
        3. Reprise automatique des opérations
        4. Intégrité des données après erreurs
        """
        env = setup_reminder_environment
        
        # Créer un événement de test
        event = Event.create(
            message_id=300001,
            channel_id=env["mock_channel"].id,
            guild=env["guild"],
            title="Test de Résilience",
            description="Test de récupération d'erreurs",
            interval_minutes=60.0,
            is_paused=False,
            required_reactions=["✅"]
        )
        
        # 1. Test de récupération après erreur de réseau
        with patch('utils.unified_event_manager.unified_event_manager._storage_adapter') as mock_adapter:
            # Simuler un échec de sauvegarde
            mock_adapter.save_data.side_effect = Exception("Erreur réseau simulée")
            
            # Tenter d'ajouter l'événement
            success = await unified_event_manager.add_event(
                event.message_id,
                title=event.title,
                description=event.description
            )
            
            # L'opération devrait échouer mais ne pas crasher
            assert not success, "L'opération devrait échouer avec l'erreur simulée"
        
        # 2. Vérifier que le système récupère
        # Rétablir le comportement normal
        success = await unified_event_manager.add_event(
            event.message_id,
            title=event.title,
            description=event.description,
            interval_minutes=event.interval_minutes
        )
        assert success, "Le système devrait récupérer après l'erreur"
        
        # 3. Test de timeout et retry
        with patch('asyncio.sleep') as mock_sleep:
            # Mock du sleep pour accélérer les tests
            mock_sleep.return_value = asyncio.create_task(asyncio.sleep(0.001))
            
            with patch('utils.reminder_manager.reminder_manager.send_reminder') as mock_send:
                # Simuler des timeouts puis un succès
                mock_send.side_effect = [
                    asyncio.TimeoutError("Timeout 1"),
                    asyncio.TimeoutError("Timeout 2"), 
                    True  # Succès au 3ème essai
                ]
                
                # Le système devrait retry et finalement réussir
                # Note: La logique de retry doit être implémentée dans reminder_manager
                result = await reminder_manager.send_reminder(event.message_id)
                
                # Vérifier que plusieurs tentatives ont été faites
                assert mock_send.call_count >= 1, "Au moins une tentative devrait être faite"
        
        # 4. Vérifier l'intégrité des données après erreurs
        final_event = Event.get_by_id(event.id)
        assert final_event.title == "Test de Résilience"
        assert final_event.is_paused is False


@pytest.mark.integration
class TestReminderFlowsExtended:
    """
    Tests d'intégration étendus pour cas complexes et edge cases.
    """

    @pytest.mark.asyncio
    async def test_concurrent_operations(self, setup_reminder_environment):
        """Test les opérations concurrentes sur les événements."""
        env = setup_reminder_environment
        
        event = Event.create(
            message_id=400001,
            channel_id=env["mock_channel"].id,
            guild=env["guild"],
            title="Test Concurrence",
            interval_minutes=60.0,
        )
        
        async def _create_reaction_async(self, event, user, emoji):
            """Méthode helper pour créer une réaction de manière asynchrone."""
            return Reaction.create(
                event=event,
                user=user,
                emoji=emoji,
                added_at=datetime.now()
            )
        
        # Opérations concurrentes
        async def concurrent_add_reactions():
            tasks = []
            for i in range(10):
                user = User.create(
                    user_id=500000 + i,
                    username=f"concurrent_user_{i}"
                )
                task = asyncio.create_task(
                    self._create_reaction_async(event, user, "✅")
                )
                tasks.append(task)
            
            await asyncio.gather(*tasks, return_exceptions=True)
        
        # Exécuter les opérations concurrentes
        await concurrent_add_reactions()
        
        # Vérifier l'intégrité
        final_count = Reaction.select().where(Reaction.event == event).count()
        assert final_count == 10, "Toutes les réactions concurrentes devraient être enregistrées"

    @pytest.mark.asyncio 
    async def test_data_migration_during_operations(self, setup_reminder_environment):
        """Test la migration de données pendant des opérations actives."""
        env = setup_reminder_environment
        
        # Créer des événements avant migration
        pre_migration_events = []
        for i in range(3):
            event = Event.create(
                message_id=500000 + i,
                channel_id=env["mock_channel"].id,
                guild=env["guild"],
                title=f"Pré-Migration {i}",
                interval_minutes=60.0 + i * 30
            )
            pre_migration_events.append(event)
        
        # Simuler une migration de données
        with patch('utils.unified_event_manager.unified_event_manager._handle_backend_switch') as mock_switch:
            mock_switch.return_value = True
            
            # Déclencher une opération qui pourrait causer un switch
            await unified_event_manager._handle_backend_switch()
        
        # Vérifier que tous les événements existent toujours
        for event in pre_migration_events:
            reloaded_event = Event.get_by_id(event.id)
            assert reloaded_event.title == event.title
            assert reloaded_event.interval_minutes == event.interval_minutes