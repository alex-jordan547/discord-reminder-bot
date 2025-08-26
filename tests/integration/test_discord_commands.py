"""
Tests d'intégration pour les commandes Discord.

Ce module teste l'intégration complète des commandes Discord :
- Intégration commandes -> gestionnaire -> base de données
- Interactions utilisateur complètes
- Gestion des permissions et autorisations
- Réponses Discord et gestion des erreurs
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch

# Imports conditionnels pour éviter les erreurs
try:
    from commands.slash_commands import (
        watch_command, unwatch_command, list_command,
        pause_command, resume_command, set_interval_command
    )
except ImportError:
    # Définir des mocks si les commandes n'existent pas
    watch_command = AsyncMock()
    unwatch_command = AsyncMock()
    list_command = AsyncMock()
    pause_command = AsyncMock()
    resume_command = AsyncMock()
    set_interval_command = AsyncMock()

try:
    from commands.handlers import CommandHandler
except ImportError:
    CommandHandler = Mock

from models.database_models import Event, Guild, User
from utils.unified_event_manager import unified_event_manager
from tests.fixtures.fixture_manager import FixtureManager
from tests.fixtures.discord_mock_manager import DiscordMockManager


class TestDiscordCommandIntegration:
    """Tests d'intégration pour les commandes Discord complètes."""

    @pytest.fixture
    async def setup_command_environment(self, temp_database):
        """Prépare l'environnement pour les tests de commandes."""
        fixture_manager = FixtureManager(temp_database)
        discord_mock_manager = DiscordMockManager()
        """Prépare l'environnement pour les tests de commandes."""
        # Initialiser les gestionnaires
        await unified_event_manager.initialize()
        
        # Créer les objets de base
        guild = fixture_manager.create_guild(guild_id=123456789)
        user = fixture_manager.create_user(user_id=111111111, username="testuser")
        
        # Mocks Discord simples
        mock_user = Mock()
        mock_user.id = user.user_id
        
        mock_guild_obj = Mock()
        mock_guild_obj.id = guild.guild_id
        
        mock_channel = Mock()
        mock_channel.id = 987654321
        mock_channel.fetch_message = AsyncMock()
        
        mock_interaction = Mock()
        mock_interaction.user = mock_user
        mock_interaction.guild = mock_guild_obj
        mock_interaction.channel = mock_channel
        mock_interaction.response = Mock()
        mock_interaction.response.send_message = AsyncMock()
        
        mock_message = Mock()
        mock_message.id = 555555555
        mock_message.content = "Test message for watching"
        mock_message.channel = mock_channel
        
        return {
            "guild": guild,
            "user": user,
            "mock_interaction": mock_interaction,
            "mock_message": mock_message,
            "mock_channel": mock_channel,
        }

    @pytest.mark.asyncio
    async def test_watch_command_full_integration(self, setup_command_environment):
        """Test l'intégration complète de la commande /watch."""
        env = setup_command_environment
        
        # Configurer le mock pour fetch_message
        env["mock_channel"].fetch_message = AsyncMock(
            return_value=env["mock_message"]
        )
        
        # Exécuter la commande /watch
        message_link = f"https://discord.com/channels/{env['guild'].guild_id}/{env['mock_interaction'].channel.id}/{env['mock_message'].id}"
        
        await watch_command(
            interaction=env["mock_interaction"],
            message_link=message_link,
            interval_hours=2.0,
            title="Test Event"
        )
        
        # Vérifier que l'événement a été créé en base
        event = Event.get(Event.message_id == env["mock_message"].id)
        assert event.title == "Test Event"
        assert event.interval_minutes == 120.0
        assert not event.is_paused
        
        # Vérifier que l'interaction a répondu
        env["mock_interaction"].response.send_message.assert_called_once()

    @pytest.mark.asyncio
    async def test_command_permission_validation(self, setup_command_environment):
        """Test la validation des permissions pour les commandes."""
        env = setup_command_environment
        
        # Simuler un utilisateur sans permissions
        unauthorized_user = Mock()
        unauthorized_user.id = 999999999
        
        unauthorized_interaction = Mock()
        unauthorized_interaction.user = unauthorized_user
        unauthorized_interaction.guild = env["mock_interaction"].guild
        unauthorized_interaction.channel = env["mock_interaction"].channel
        unauthorized_interaction.response = Mock()
        unauthorized_interaction.response.send_message = AsyncMock()
        
        with patch('utils.permissions.has_manage_permissions') as mock_perms:
            mock_perms.return_value = False
            
            # Tenter d'utiliser une commande sans permissions
            await watch_command(
                interaction=unauthorized_interaction,
                message_link="https://discord.com/channels/123/456/789",
                interval_hours=1.0
            )
            
            # Vérifier que l'erreur de permission est gérée
            unauthorized_interaction.response.send_message.assert_called_once()
            args, kwargs = unauthorized_interaction.response.send_message.call_args
            assert "permission" in str(args[0]).lower() or "permission" in str(kwargs.get('content', '')).lower()

    @pytest.mark.asyncio
    async def test_error_handling_in_commands(self, setup_command_environment):
        """Test la gestion d'erreurs dans les commandes."""
        env = setup_command_environment
        
        # Simuler une erreur de base de données
        with patch('models.database_models.Event.create') as mock_create:
            mock_create.side_effect = Exception("Database error")
            
            message_link = f"https://discord.com/channels/{env['guild'].guild_id}/123/456"
            
            await watch_command(
                interaction=env["mock_interaction"],
                message_link=message_link,
                interval_hours=1.0
            )
            
            # Vérifier que l'erreur est gérée gracieusement
            env["mock_interaction"].response.send_message.assert_called_once()