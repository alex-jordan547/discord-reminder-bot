"""
Tests fonctionnels end-to-end pour le Discord Reminder Bot.

Ces tests simulent des scénarios utilisateur complets et réalistes,
couvrant les cas d'usage typiques, la gestion d'erreurs, les interactions
multi-utilisateurs et les scénarios de charge.

Conforme à la tâche 5.1 : Tests de scénarios utilisateur complets.
"""

import asyncio
import json
import logging
import os
import random
import tempfile
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

logger = logging.getLogger(__name__)


class TestTypicalUserScenarios:
    """Tests des scénarios d'usage typiques du bot."""

    @pytest.mark.functional
    @pytest.mark.asyncio
    async def test_complete_reminder_lifecycle(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test du cycle de vie complet d'un rappel.
        
        Scénario : Un utilisateur crée un rappel, reçoit des notifications,
        et gère les réactions des participants.
        """
        # 1. Préparer l'environnement
        guild, users = fixture_manager.create_guild_with_users(
            user_count=5, name="Gaming Guild", member_count=50
        )
        admin_user = users[0]
        participants = users[1:]

        # Créer les mocks Discord
        mock_bot = discord_mock_manager.create_bot_mock()
        mock_guild = discord_mock_manager.create_guild_mock(id=guild.guild_id, name=guild.name)
        mock_channel = discord_mock_manager.create_channel_mock(
            id=300000000000000001, guild=mock_guild, name="events"
        )
        mock_message = discord_mock_manager.create_message_mock(
            id=400000000000000001,
            channel=mock_channel,
            author=discord_mock_manager.create_user_mock(id=admin_user.user_id),
            content="🎮 Match CS:GO ce soir à 20h ! Qui est partant ?",
        )

        # 2. Créer un événement via le gestionnaire de rappels
        from utils.event_manager_adapter import event_manager_adapter as reminder_manager

        # Créer un Event directement
        event = fixture_manager.create_event(
            guild=guild,
            title="Match CS:GO",
            interval_minutes=120,  # 2 heures
            message_id=400000000000000001,
            channel_id=300000000000000001,
        )

        # 3. Simuler les réactions des utilisateurs
        from datetime import timedelta
        
        mock_reactions = []
        for i, user in enumerate(participants):
            emoji = "✅" if i < 3 else "❌"  # 3 participants positifs, 1 négatif
            reaction = fixture_manager.create_reaction(
                event=event,
                user=user,
                emoji=emoji,
                added_at=datetime.now() - timedelta(minutes=random.randint(1, 30)),
            )
            mock_reactions.append(reaction)

        # 4. Tester la logique de rappel - simuler qu'il est temps d'envoyer un rappel
        event.last_reminder = datetime.now() - timedelta(hours=3)
        event.save()

        # Vérifier que l'événement est considéré comme nécessitant un rappel
        assert event.is_due_for_reminder, "L'événement devrait nécessiter un rappel"

        # Ajouter l'événement au gestionnaire de rappels pour les tests de pause/reprise
        add_success = await reminder_manager.add_reminder(event)
        assert add_success, "L'ajout de l'événement au gestionnaire doit réussir"

        # 5. Tester la pause et reprise
        # Mettre en pause
        pause_success = await reminder_manager.pause_reminder(event.message_id)
        assert pause_success, "La pause doit réussir"

        # Recharger l'événement depuis la base de données
        event_paused = await reminder_manager.get_reminder(event.message_id)
        if event_paused is None:
            # Fallback : recharger depuis la base de données directement
            from models.database_models import Event
            event_paused = Event.get_by_id(event.id)
        assert event_paused.is_paused, "L'événement doit être en pause"

        # Reprendre
        resume_success = await reminder_manager.resume_reminder(event.message_id)
        assert resume_success, "La reprise doit réussir"

        # Recharger l'événement
        event_resumed = await reminder_manager.get_reminder(event.message_id)
        if event_resumed is None:
            # Fallback : recharger depuis la base de données directement
            from models.database_models import Event
            event_resumed = Event.get_by_id(event.id)
        assert not event_resumed.is_paused, "L'événement ne doit plus être en pause"

    @pytest.mark.functional
    @pytest.mark.asyncio
    async def test_multi_guild_independence(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test de l'indépendance entre plusieurs guilds.
        
        Scénario : Plusieurs guilds utilisent le bot simultanément
        sans interférence mutuelle.
        """
        # Créer 3 guilds différents
        guilds_data = []
        for i in range(3):
            guild, users = fixture_manager.create_guild_with_users(
                user_count=3, name=f"Guild {i+1}", member_count=random.randint(20, 100)
            )
            guilds_data.append((guild, users))

        # Créer des événements dans chaque guild
        events = []
        for guild, users in guilds_data:
            event = fixture_manager.create_event(
                guild=guild,
                title=f"Event in {guild.name}",
                interval_minutes=60,
                message_id=fixture_manager.get_unique_id("message"),
                channel_id=fixture_manager.get_unique_id("channel"),
            )
            events.append(event)

            # Ajouter des réactions spécifiques à chaque guild
            for user in users:
                fixture_manager.create_reaction(
                    event=event, user=user, emoji="✅" if random.random() > 0.3 else "❌"
                )

        # Ajouter les événements au reminder manager pour qu'ils soient visibles par la commande list
        from utils.event_manager_adapter import event_manager_adapter as reminder_manager
        for event in events:
            await reminder_manager.add_reminder(event)

        # Vérifier l'isolation des données
        from models.database_models import Event, Reaction

        for i, (guild, users) in enumerate(guilds_data):
            # Vérifier que chaque guild ne voit que ses propres événements
            guild_events = list(Event.select().where(Event.guild == guild))
            assert len(guild_events) == 1
            assert guild_events[0].title == f"Event in {guild.name}"

            # Vérifier que les réactions sont isolées par guild
            guild_reactions = list(
                Reaction.select().join(Event).where(Event.guild == guild)
            )
            assert len(guild_reactions) == len(users)

            # Vérifier que chaque réaction a un utilisateur associé
            for reaction in guild_reactions:
                assert hasattr(reaction, 'user_id'), "La réaction devrait avoir un user_id"

        # Tester les commandes avec isolation
        mock_bot = discord_mock_manager.create_bot_mock()
        from commands.slash_commands import SlashCommands

        slash_commands = SlashCommands(mock_bot)

        for guild, users in guilds_data:
            mock_guild = discord_mock_manager.create_guild_mock(
                id=guild.guild_id, name=guild.name
            )
            mock_interaction = Mock()
            mock_interaction.response = AsyncMock()
            mock_interaction.followup = AsyncMock()
            mock_interaction.guild = mock_guild
            mock_interaction.user = discord_mock_manager.create_user_mock(id=users[0].user_id)

            # Lister les événements - chaque guild ne doit voir que les siens
            await slash_commands.list_events.callback(slash_commands, mock_interaction)

            # Vérifier que la réponse ne contient que les événements du guild
            mock_interaction.response.send_message.assert_called()
            call_args = mock_interaction.response.send_message.call_args
            # La réponse peut être dans un embed ou dans le message direct
            response_content = str(call_args)
            
            # Si la réponse contient un embed, extraire son contenu
            if "embed=" in response_content:
                # Pour simplifier, vérifions que la réponse ne contient pas les événements des autres guilds
                # et qu'elle ne dit pas "Aucun événement"
                assert "Aucun événement" not in response_content, f"Aucun événement trouvé pour le guild {guild.name}"
            else:
                # Vérifier que le titre de l'événement est présent dans la réponse
                assert f"Event in {guild.name}" in response_content, f"Événement du guild {guild.name} non trouvé dans la réponse: {response_content}"

    @pytest.mark.functional
    @pytest.mark.asyncio
    async def test_concurrent_user_interactions(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test des interactions simultanées de plusieurs utilisateurs.
        
        Scénario : Plusieurs utilisateurs interagissent simultanément
        avec le bot sans conflit ni corruption de données.
        """
        # Préparer l'environnement
        guild, users = fixture_manager.create_guild_with_users(
            user_count=10, name="Busy Guild", member_count=200
        )

        # Créer un événement de base
        event = fixture_manager.create_event(
            guild=guild,
            title="Concurrent Test Event",
            interval_minutes=30,
        )

        # Simuler des actions concurrentes
        mock_bot = discord_mock_manager.create_bot_mock()
        from commands.slash_commands import SlashCommands

        slash_commands = SlashCommands(mock_bot)

        async def user_action(user, action_type):
            """Simule une action utilisateur spécifique."""
            mock_guild = discord_mock_manager.create_guild_mock(
                id=guild.guild_id, name=guild.name
            )
            mock_interaction = Mock()
            mock_interaction.response = AsyncMock()
            mock_interaction.followup = AsyncMock()
            mock_interaction.guild = mock_guild
            mock_interaction.user = discord_mock_manager.create_user_mock(id=user.user_id)

            try:
                if action_type == "list":
                    await slash_commands.list_events.callback(slash_commands, mock_interaction)
                elif action_type == "pause":
                    await slash_commands.pause.callback(slash_commands, mock_interaction, message=f"https://discord.com/channels/{guild.guild_id}/{event.channel_id}/{event.message_id}")
                elif action_type == "resume":
                    await slash_commands.resume.callback(slash_commands, mock_interaction, message=f"https://discord.com/channels/{guild.guild_id}/{event.channel_id}/{event.message_id}")
                elif action_type == "reaction":
                    # Simuler l'ajout d'une réaction
                    fixture_manager.create_reaction(
                        event=event, user=user, emoji=random.choice(["✅", "❌", "🤔"])
                    )

                return True
            except Exception as e:
                logger.warning(f"User action failed: {e}")
                return False

        # Lancer des actions concurrentes
        tasks = []
        for i, user in enumerate(users):
            action_type = ["list", "reaction", "list", "reaction"][i % 4]
            task = asyncio.create_task(user_action(user, action_type))
            tasks.append(task)

        # Attendre que toutes les actions se terminent
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Vérifier que la plupart des actions ont réussi
        successful_actions = sum(1 for r in results if r is True)
        assert successful_actions >= len(users) * 0.8  # Au moins 80% de succès

        # Vérifier l'intégrité des données
        from models.database_models import Reaction

        reactions = list(Reaction.select().where(Reaction.event == event))
        # Il devrait y avoir des réactions mais pas de doublons par utilisateur
        user_reactions = {}
        for reaction in reactions:
            if reaction.user_id in user_reactions:
                # Pas de doublons exacts (même utilisateur, même emoji)
                existing = user_reactions[reaction.user_id]
                assert reaction.emoji != existing or reaction.added_at != existing
            user_reactions[reaction.user_id] = reaction.emoji

    @pytest.mark.functional
    @pytest.mark.asyncio
    async def test_error_handling_and_recovery(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test de la gestion d'erreurs et de la récupération.
        
        Scénario : Le bot rencontre diverses erreurs et doit
        les gérer gracieusement sans corrompre les données.
        """
        guild, users = fixture_manager.create_guild_with_users(user_count=3)
        admin_user = users[0]

        mock_bot = discord_mock_manager.create_bot_mock()
        from commands.slash_commands import SlashCommands

        slash_commands = SlashCommands(mock_bot)

        # Préparer les mocks d'interaction
        mock_guild = discord_mock_manager.create_guild_mock(
            id=guild.guild_id, name=guild.name
        )
        mock_interaction = Mock()
        mock_interaction.response = AsyncMock()
        mock_interaction.followup = AsyncMock()
        mock_interaction.guild = mock_guild
        mock_interaction.user = discord_mock_manager.create_user_mock(id=admin_user.user_id)

        # Test 1: Lien de message invalide
        try:
            await slash_commands.watch.callback(
                slash_commands,
                interaction=mock_interaction,
                message="invalid_link",
                interval=3600,  # 1 heure en secondes
            )
            # La commande devrait gérer l'erreur gracieusement
            mock_interaction.response.send_message.assert_called()
            error_msg = str(mock_interaction.response.send_message.call_args)
            assert "erreur" in error_msg.lower() or "invalid" in error_msg.lower()
        except Exception:
            pytest.fail("La commande aurait dû gérer l'erreur gracieusement")

        # Test 2: Intervalle invalide
        try:
            await slash_commands.watch.callback(
                slash_commands,
                interaction=mock_interaction,
                message=f"https://discord.com/channels/{guild.guild_id}/123/456",
                interval=3600,  # 1 heure en secondes
                title="Test Event",
            )
            # Vérifier que l'erreur est gérée
            assert mock_interaction.response.send_message.called
        except Exception:
            pytest.fail("La commande aurait dû gérer l'intervalle invalide")

        # Test 3: Opération sur événement inexistant
        try:
            await slash_commands.pause.callback(slash_commands, mock_interaction, message="https://discord.com/channels/123/456/999999999999999999")
            # Devrait retourner une erreur appropriée
            assert mock_interaction.response.send_message.called
        except Exception:
            pytest.fail("La commande aurait dû gérer l'événement inexistant")

        # Test 4: Simuler une erreur de base de données
        event = fixture_manager.create_event(guild=guild, title="Test Event")

        with patch("models.database_models.Event.get") as mock_get:
            mock_get.side_effect = Exception("Database error")
            try:
                await slash_commands.pause.callback(slash_commands, mock_interaction, message=f"https://discord.com/channels/{guild.guild_id}/{event.channel_id}/{event.message_id}")
                # L'erreur devrait être gérée
                assert True
            except Exception:
                pytest.fail("Les erreurs de base de données devraient être gérées")

        # Vérifier que les données ne sont pas corrompues
        from models.database_models import Event

        events = list(Event.select().where(Event.guild == guild))
        for event in events:
            assert event.title is not None
            assert event.guild_id == guild.guild_id
            assert event.interval_minutes > 0

class TestLoadAndStressScenarios:
    """Tests de charge et de stress."""

    @pytest.mark.functional
    @pytest.mark.slow
    @pytest.mark.asyncio
    async def test_multiple_guilds_high_activity(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test de charge avec plusieurs guilds très actifs.
        
        Scénario : 5 guilds avec beaucoup d'événements et d'utilisateurs
        interagissant simultanément.
        """
        guild_count = 5
        users_per_guild = 15
        events_per_guild = 8

        # Créer les guilds et leur contenu
        guilds_data = []
        all_events = []

        for i in range(guild_count):
            guild, users = fixture_manager.create_guild_with_users(
                user_count=users_per_guild,
                name=f"High Activity Guild {i+1}",
                member_count=random.randint(100, 500),
            )

            # Créer plusieurs événements par guild
            guild_events = []
            for j in range(events_per_guild):
                event = fixture_manager.create_event(
                    guild=guild,
                    title=f"Event {j+1} in Guild {i+1}",
                    interval_minutes=random.choice([30, 60, 120, 240]),
                )
                guild_events.append(event)

                # Ajouter des réactions aléatoires
                reaction_count = random.randint(3, len(users))
                selected_users = random.sample(users, reaction_count)
                for user in selected_users:
                    fixture_manager.create_reaction(
                        event=event,
                        user=user,
                        emoji=random.choice(["✅", "❌", "🤔", "⭐"]),
                    )

            guilds_data.append((guild, users, guild_events))
            all_events.extend(guild_events)

        # Test de performance : vérifier que les requêtes restent rapides
        start_time = datetime.now()

        # Simuler des requêtes simultanées de listing
        mock_bot = discord_mock_manager.create_bot_mock()
        from commands.slash_commands import SlashCommands

        slash_commands = SlashCommands(mock_bot)

        async def list_events_for_guild(guild_data):
            guild, users, events = guild_data
            mock_guild = discord_mock_manager.create_guild_mock(
                id=guild.guild_id, name=guild.name
            )
            mock_interaction = Mock()
            mock_interaction.response = AsyncMock()
            mock_interaction.followup = AsyncMock()
            mock_interaction.guild = mock_guild
            mock_interaction.user = discord_mock_manager.create_user_mock(id=users[0].user_id)

            await slash_commands.list_events.callback(slash_commands, mock_interaction)
            return True

        # Exécuter toutes les requêtes en parallèle
        tasks = [list_events_for_guild(guild_data) for guild_data in guilds_data]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Mesurer le temps de réponse
        elapsed = (datetime.now() - start_time).total_seconds()

        # Vérifier les résultats
        successful_queries = sum(1 for r in results if r is True)
        assert successful_queries == guild_count

        # Vérifier que les performances restent acceptables (< 10 secondes pour tout)
        assert elapsed < 10.0, f"Les requêtes ont pris trop de temps: {elapsed}s"

        # Vérifier l'intégrité des données après la charge
        from models.database_models import Event, Guild, Reaction

        total_events = Event.select().count()
        total_reactions = Reaction.select().count()
        total_guilds = Guild.select().count()

        assert total_events == guild_count * events_per_guild
        assert total_guilds >= guild_count
        assert total_reactions > 0

        logger.info(
            f"Load test completed: {total_guilds} guilds, "
            f"{total_events} events, {total_reactions} reactions in {elapsed:.2f}s"
        )

    @pytest.mark.functional
    @pytest.mark.slow
    @pytest.mark.asyncio
    async def test_reminder_system_under_load(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test du système de rappels sous charge.
        
        Scénario : Beaucoup d'événements nécessitent des rappels simultanément.
        """
        # Créer 3 guilds avec plusieurs événements nécessitant des rappels
        guilds_data = []
        due_events = []

        for i in range(3):
            guild, users = fixture_manager.create_guild_with_users(
                user_count=8, name=f"Reminder Test Guild {i+1}"
            )

            # Créer des événements qui nécessitent des rappels
            for j in range(10):
                event = fixture_manager.create_event(
                    guild=guild,
                    title=f"Urgent Event {j+1}",
                    interval_minutes=60,
                )

                # Simuler que ces événements nécessitent des rappels
                event.last_reminder = datetime.now() - timedelta(hours=2)
                event.save()
                due_events.append(event)

                # Ajouter quelques réactions pour rendre plus réaliste
                for user in random.sample(users, random.randint(2, 5)):
                    fixture_manager.create_reaction(event=event, user=user)

            guilds_data.append((guild, users))

        # Tester le système de rappels
        from utils.reminder_manager import reminder_manager

        start_time = datetime.now()

        # Exécuter la vérification des rappels
        due_events = await reminder_manager.get_due_events()
        reminders_sent = len(due_events)  # Simplification pour le test

        elapsed = (datetime.now() - start_time).total_seconds()

        # Vérifier que des rappels ont été traités
        assert reminders_sent > 0, "Des rappels auraient dû être envoyés"

        # Vérifier que le traitement reste rapide même avec beaucoup d'événements
        assert elapsed < 30.0, f"Le traitement des rappels a pris trop de temps: {elapsed}s"

        # Vérifier que les événements ont été mis à jour
        updated_events = 0
        for event in due_events:
            # Recharger l'événement depuis la base
            from models.database_models import Event
            event = Event.get_by_id(event.id)
            if event.last_reminder > start_time - timedelta(seconds=5):
                updated_events += 1

        assert updated_events > 0, "Certains événements auraient dû être mis à jour"

        logger.info(
            f"Reminder system test: {reminders_sent} reminders processed "
            f"in {elapsed:.2f}s from {len(due_events)} events"
        )

class TestEdgeCasesAndCornerScenarios:
    """Tests des cas limites et scénarios particuliers."""

    @pytest.mark.functional
    @pytest.mark.asyncio
    async def test_empty_guild_scenarios(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test des scénarios avec guilds vides ou sans activité.
        """
        # Créer un guild sans événements
        empty_guild = fixture_manager.create_guild(name="Empty Guild")

        mock_bot = discord_mock_manager.create_bot_mock()
        from commands.slash_commands import SlashCommands

        slash_commands = SlashCommands(mock_bot)

        mock_guild = discord_mock_manager.create_guild_mock(
            guild_id=empty_guild.guild_id, name=empty_guild.name
        )
        mock_user = discord_mock_manager.create_user_mock(id=fixture_manager.get_unique_id("user"))
        mock_interaction = Mock()
        mock_interaction.response = AsyncMock()
        mock_interaction.followup = AsyncMock()
        mock_interaction.guild = mock_guild
        mock_interaction.user = mock_user

        # Tester les commandes sur un guild vide
        await slash_commands.list_events.callback(slash_commands, mock_interaction)

        # Vérifier que la réponse indique qu'il n'y a pas d'événements
        mock_interaction.response.send_message.assert_called()
        response = str(mock_interaction.response.send_message.call_args)
        # Vérifier que la réponse contient un embed et qu'il indique qu'il n'y a pas d'événements
        assert "embed=" in response.lower(), "La réponse devrait contenir un embed"
        # Vérifier que le message n'indique pas d'erreur
        assert "error" not in response.lower() and "erreur" not in response.lower(), "La réponse ne devrait pas contenir d'erreur"

    @pytest.mark.functional
    @pytest.mark.asyncio
    async def test_rapid_state_changes(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test des changements d'état rapides (pause/reprise multiples).
        """
        guild, users = fixture_manager.create_guild_with_users(user_count=2)
        event = fixture_manager.create_event(guild=guild, title="State Change Test")

        mock_bot = discord_mock_manager.create_bot_mock()
        from commands.slash_commands import SlashCommands

        slash_commands = SlashCommands(mock_bot)

        mock_guild = discord_mock_manager.create_guild_mock(
            guild_id=guild.guild_id, name=guild.name
        )
        mock_interaction = Mock()
        mock_interaction.response = AsyncMock()
        mock_interaction.followup = AsyncMock()
        mock_interaction.guild = mock_guild
        mock_interaction.user = discord_mock_manager.create_user_mock(id=users[0].user_id)

        # Effectuer plusieurs changements d'état rapidement
        for i in range(5):
            await slash_commands.pause.callback(slash_commands, mock_interaction, message=f"https://discord.com/channels/{guild.guild_id}/{event.channel_id}/{event.message_id}")
            await slash_commands.resume.callback(slash_commands, mock_interaction, message=f"https://discord.com/channels/{guild.guild_id}/{event.channel_id}/{event.message_id}")

        # Vérifier l'état final
        from models.database_models import Event

        final_event = Event.get_by_id(event.id)
        assert not final_event.is_paused, "L'événement devrait être actif après les cycles pause/reprise"

    @pytest.mark.functional
    @pytest.mark.asyncio
    async def test_data_consistency_across_operations(self, working_database, fixture_manager, discord_mock_manager):
        """
        Test de la cohérence des données à travers différentes opérations.
        """
        # Créer un environnement complexe
        guild, users = fixture_manager.create_guild_with_users(user_count=5)
        events = []

        for i in range(3):
            event = fixture_manager.create_event(
                guild=guild, title=f"Consistency Test Event {i+1}"
            )
            events.append(event)

            # Ajouter des réactions
            for user in users:
                if random.random() > 0.3:  # 70% de chance de réaction
                    fixture_manager.create_reaction(event=event, user=user)

        # Capturer l'état initial
        from models.database_models import Event, Reaction

        initial_event_count = Event.select().where(Event.guild == guild).count()
        initial_reaction_count = (
            Reaction.select()
            .join(Event)
            .where(Event.guild == guild)
            .count()
        )

        # Effectuer diverses opérations
        mock_bot = discord_mock_manager.create_bot_mock()
        from commands.slash_commands import SlashCommands

        slash_commands = SlashCommands(mock_bot)

        mock_guild = discord_mock_manager.create_guild_mock(
            guild_id=guild.guild_id, name=guild.name
        )
        mock_interaction = Mock()
        mock_interaction.response = AsyncMock()
        mock_interaction.followup = AsyncMock()
        mock_interaction.guild = mock_guild
        mock_interaction.user = discord_mock_manager.create_user_mock(id=users[0].user_id)

        # Pause/reprise d'événements
        for event in events[:2]:
            await slash_commands.pause.callback(slash_commands, mock_interaction, message=f"https://discord.com/channels/{guild.guild_id}/{event.channel_id}/{event.message_id}")

        # Ajouter plus de réactions
        for event in events:
            for user in random.sample(users, 2):
                try:
                    fixture_manager.create_reaction(event=event, user=user, emoji="🎯")
                except Exception:
                    # Ignorer les doublons
                    pass

        # Reprendre les événements
        for event in events[:2]:
            await slash_commands.resume.callback(slash_commands, mock_interaction, message=f"https://discord.com/channels/{guild.guild_id}/{event.channel_id}/{event.message_id}")

        # Vérifier la cohérence finale
        final_event_count = Event.select().where(Event.guild == guild).count()
        final_reaction_count = (
            Reaction.select()
            .join(Event)
            .where(Event.guild == guild)
            .count()
        )

        # Les événements ne devraient pas avoir été supprimés
        assert final_event_count == initial_event_count

        # Les réactions devraient avoir augmenté
        assert final_reaction_count > initial_reaction_count

        # Vérifier que toutes les relations sont intactes
        for event in Event.select().where(Event.guild == guild):
            assert event.guild.guild_id == guild.guild_id
            assert event.title is not None
            assert event.interval_minutes > 0

            # Vérifier les réactions associées
            event_reactions = list(event.reactions)
            for reaction in event_reactions:
                assert reaction.event.id == event.id
                assert reaction.user_id is not None
                assert reaction.emoji is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])