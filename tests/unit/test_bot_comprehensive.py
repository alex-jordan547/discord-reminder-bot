"""
Tests complets pour bot.py - Point d'entrée principal du Discord Reminder Bot
"""
import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import pytest_asyncio

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from bot import DiscordReminderBot
from config.settings import Settings


class TestDiscordReminderBot:
    """Tests pour la classe DiscordReminderBot"""

    @pytest.fixture
    def bot_settings(self):
        """Settings de test pour le bot"""
        return Settings(
            discord_token="test_token",
            test_mode=True,
            log_level="DEBUG",
            log_to_file=False
        )

    @pytest.fixture
    def mock_discord_client(self):
        """Client Discord mocké"""
        with patch('discord.ext.commands.Bot') as mock_client:
            client = mock_client.return_value
            client.user = MagicMock()
            client.user.name = "TestBot"
            client.user.discriminator = "1234"
            client.guilds = []
            client.latency = 0.1
            client.is_ready.return_value = True
            yield client

    @pytest.fixture
    def mock_storage_adapter(self):
        """Storage adapter mocké"""
        with patch('utils.storage_adapter.storage_adapter') as mock_adapter:
            mock_adapter.load_events = AsyncMock(return_value=[])
            mock_adapter.save_events = AsyncMock()
            mock_adapter.close = AsyncMock()
            yield mock_adapter

    @pytest.fixture 
    def mock_unified_event_manager(self):
        """Event manager unifié mocké"""
        with patch('utils.unified_event_manager.UnifiedEventManager') as mock_manager:
            manager_instance = mock_manager.return_value
            manager_instance.get_events_due_for_reminder = MagicMock(return_value=[])
            manager_instance.close = AsyncMock()
            yield manager_instance

    @pytest.fixture
    async def bot_instance(self, bot_settings, mock_discord_client, mock_storage_adapter, mock_unified_event_manager):
        """Instance de bot pour les tests"""
        with patch('bot.setup_logging'), \
             patch('bot.check_and_migrate_if_needed', new_callable=AsyncMock), \
             patch('bot.sync_slash_commands', new_callable=AsyncMock):
            
            bot = DiscordReminderBot(bot_settings)
            yield bot

    def test_bot_initialization(self, bot_settings):
        """Test l'initialisation du bot"""
        with patch('bot.setup_logging'), \
             patch('discord.ext.commands.Bot'):
            
            bot = DiscordReminderBot(bot_settings)
            
            assert bot.settings == bot_settings
            assert bot.settings.test_mode is True
            assert bot.settings.log_level == "DEBUG"

    @pytest.mark.asyncio
    async def test_bot_on_ready_event(self, bot_instance, mock_discord_client):
        """Test l'événement on_ready"""
        mock_discord_client.user.name = "TestBot"
        mock_discord_client.user.discriminator = "1234"
        mock_discord_client.guilds = [MagicMock(), MagicMock()]
        
        with patch('bot.sync_slash_commands', new_callable=AsyncMock) as mock_sync, \
             patch('bot.schedule_next_reminder_check', new_callable=AsyncMock) as mock_schedule:
            
            await bot_instance.on_ready()
            
            mock_sync.assert_called_once()
            mock_schedule.assert_called_once()

    @pytest.mark.asyncio
    async def test_bot_graceful_shutdown(self, bot_instance, mock_storage_adapter, mock_unified_event_manager):
        """Test l'arrêt gracieux du bot"""
        with patch('asyncio.get_event_loop') as mock_loop:
            loop = mock_loop.return_value
            loop.is_running.return_value = True
            
            await bot_instance.close()
            
            mock_storage_adapter.close.assert_called_once()
            mock_unified_event_manager.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_bot_error_handling(self, bot_instance):
        """Test la gestion d'erreurs du bot"""
        error = Exception("Test error")
        
        with patch('bot.logger') as mock_logger:
            await bot_instance.on_error("test_event", error)
            
            mock_logger.error.assert_called()
            assert "test_event" in str(mock_logger.error.call_args)

    @pytest.mark.asyncio 
    async def test_database_migration_on_start(self, bot_settings):
        """Test la migration de base de données au démarrage"""
        with patch('bot.setup_logging'), \
             patch('discord.ext.commands.Bot'), \
             patch('bot.check_and_migrate_if_needed', new_callable=AsyncMock) as mock_migrate, \
             patch('bot.storage_adapter') as mock_adapter:
            
            mock_adapter.load_events = AsyncMock(return_value=[])
            
            bot = DiscordReminderBot(bot_settings)
            await bot.on_ready()
            
            mock_migrate.assert_called_once()

    def test_bot_settings_validation(self):
        """Test la validation des settings du bot"""
        # Test avec token manquant
        with pytest.raises(ValueError):
            Settings(discord_token="")

        # Test avec paramètres valides
        settings = Settings(
            discord_token="valid_token",
            test_mode=True,
            reminder_interval_hours=1.0
        )
        
        assert settings.discord_token == "valid_token"
        assert settings.test_mode is True
        assert settings.reminder_interval_hours == 1.0

    @pytest.mark.asyncio
    async def test_reminder_scheduling_initialization(self, bot_instance):
        """Test l'initialisation de la planification des rappels"""
        with patch('bot.schedule_next_reminder_check', new_callable=AsyncMock) as mock_schedule, \
             patch('bot.sync_slash_commands', new_callable=AsyncMock):
            
            await bot_instance.on_ready()
            
            mock_schedule.assert_called_once()

    def test_bot_configuration_test_mode(self, bot_settings):
        """Test la configuration en mode test"""
        bot_settings.test_mode = True
        bot_settings.reminder_interval_hours = 0.1  # 6 minutes
        
        with patch('bot.setup_logging'), \
             patch('discord.ext.commands.Bot'):
            
            bot = DiscordReminderBot(bot_settings)
            
            assert bot.settings.test_mode is True
            assert bot.settings.reminder_interval_hours == 0.1

    @pytest.mark.asyncio
    async def test_bot_connection_failure_handling(self, bot_settings):
        """Test la gestion des échecs de connexion"""
        with patch('discord.ext.commands.Bot') as mock_bot_class:
            mock_bot = mock_bot_class.return_value
            mock_bot.start = AsyncMock(side_effect=Exception("Connection failed"))
            
            bot = DiscordReminderBot(bot_settings)
            
            with pytest.raises(Exception, match="Connection failed"):
                await bot.start(bot_settings.discord_token)


class TestBotIntegration:
    """Tests d'intégration pour le bot complet"""

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_bot_full_startup_sequence(self):
        """Test de la séquence complète de démarrage du bot"""
        settings = Settings(
            discord_token="test_token",
            test_mode=True,
            log_level="INFO"
        )
        
        with patch('bot.setup_logging') as mock_logging, \
             patch('discord.ext.commands.Bot') as mock_bot_class, \
             patch('bot.check_and_migrate_if_needed', new_callable=AsyncMock) as mock_migrate, \
             patch('bot.sync_slash_commands', new_callable=AsyncMock) as mock_sync, \
             patch('bot.schedule_next_reminder_check', new_callable=AsyncMock) as mock_schedule, \
             patch('bot.storage_adapter') as mock_adapter:
            
            mock_bot = mock_bot_class.return_value
            mock_bot.user = MagicMock()
            mock_bot.user.name = "TestBot"
            mock_bot.user.discriminator = "1234"
            mock_bot.guilds = []
            
            mock_adapter.load_events = AsyncMock(return_value=[])
            
            bot = DiscordReminderBot(settings)
            await bot.on_ready()
            
            # Vérifier que tous les composants sont initialisés
            mock_logging.assert_called_once()
            mock_migrate.assert_called_once()
            mock_sync.assert_called_once() 
            mock_schedule.assert_called_once()

    @pytest.mark.integration
    def test_bot_with_real_settings(self):
        """Test le bot avec des settings réelles (sans connexion Discord)"""
        import os
        from pathlib import Path
        
        # Simuler un fichier .env
        env_content = """
DISCORD_TOKEN=test_token_for_integration
TEST_MODE=true
LOG_LEVEL=DEBUG
REMINDER_INTERVAL_HOURS=0.5
"""
        
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.read_text', return_value=env_content), \
             patch('bot.setup_logging'), \
             patch('discord.ext.commands.Bot'):
            
            # Recharger les settings pour prendre en compte le mock
            from config.settings import Settings
            settings = Settings()
            
            bot = DiscordReminderBot(settings)
            
            assert bot.settings.test_mode is True
            assert bot.settings.log_level == "DEBUG"
            assert bot.settings.reminder_interval_hours == 0.5