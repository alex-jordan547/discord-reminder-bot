"""
Tests unitaires complets pour le module commands/slash_commands.py

Ce module teste tous les aspects des commandes slash Discord, incluant :
- Tous les handlers de commandes slash
- Validation des permissions et paramètres
- Gestion des erreurs et réponses utilisateur
- Intégration avec le système de rappels
- Mocks appropriés pour Discord et les dépendances
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, MagicMock, Mock, patch

# Ajouter le répertoire racine au path pour les imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import discord
from commands.slash_commands import SlashCommands, send_error_to_user
from config.settings import Settings
from models.database_models import Event
from utils.message_parser import MessageLinkInfo
from utils.validation import ValidationError


class TestSlashCommandsBase(IsolatedAsyncioTestCase):
    """Classe de base pour les tests de SlashCommands."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Mock du bot Discord
        self.bot = Mock(spec=discord.Client)
        self.bot.user = Mock()
        self.bot.user.id = 12345
        self.bot.user.avatar = Mock()
        self.bot.user.avatar.url = "https://example.com/avatar.png"

        # Mock de la guild (serveur)
        self.guild = Mock(spec=discord.Guild)
        self.guild.id = 67890
        self.guild.name = "Test Server"
        self.guild.members = []

        # Mock du canal
        self.channel = Mock(spec=discord.TextChannel)
        self.channel.id = 11111
        self.channel.permissions_for = Mock(return_value=Mock(view_channel=True, send_messages=True))

        # Mock de l'utilisateur
        self.user = Mock(spec=discord.Member)
        self.user.id = 54321
        self.user.roles = [Mock(name="Admin")]
        self.user.bot = False

        # Mock du message Discord
        self.message = Mock(spec=discord.Message)
        self.message.id = 98765
        self.message.content = "Test Event Message"
        self.message.reactions = []

        # Mock de l'interaction Discord
        self.interaction = Mock(spec=discord.Interaction)
        self.interaction.guild = self.guild
        self.interaction.user = self.user
        self.interaction.response = Mock()
        self.interaction.response.is_done.return_value = False
        self.interaction.response.send_message = AsyncMock()
        self.interaction.response.defer = AsyncMock()
        self.interaction.followup = Mock()
        self.interaction.followup.send = AsyncMock()

        # Configuration par défaut pour les mocks
        self.bot.get_channel.return_value = self.channel
        self.bot.get_guild.return_value = self.guild

        # Instance de SlashCommands
        self.slash_commands = SlashCommands(self.bot)

        # Mock reminder_manager par défaut
        self.reminder_manager_mock = Mock()
        self.reminder_manager_mock.get_reminder = AsyncMock(return_value=None)
        self.reminder_manager_mock.add_reminder = AsyncMock(return_value=True)
        self.reminder_manager_mock.remove_reminder = AsyncMock(return_value=True)
        self.reminder_manager_mock.update_reminder_interval = AsyncMock(return_value=True)
        self.reminder_manager_mock.pause_reminder = AsyncMock(return_value=True)
        self.reminder_manager_mock.resume_reminder = AsyncMock(return_value=True)
        self.reminder_manager_mock.get_guild_reminders = AsyncMock(return_value={})
        self.reminder_manager_mock.reminders = {}


class TestSendErrorToUser(TestSlashCommandsBase):
    """Tests pour la fonction send_error_to_user."""

    async def test_send_error_database_error(self):
        """Test envoi d'erreur pour erreur de base de données."""
        error = Exception("database connection failed")
        
        await send_error_to_user(self.interaction, error, "l'ajout d'événement")
        
        # Vérifier que le message d'erreur approprié est envoyé
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        message = call_args[0][0]
        self.assertIn("Erreur de base de données", message)
        self.assertIn("lors de l'ajout d'événement", message)
        self.assertTrue(call_args[1]["ephemeral"])

    async def test_send_error_integrity_error(self):
        """Test envoi d'erreur pour IntegrityError."""
        error = Exception("IntegrityError")
        error.__class__.__name__ = "IntegrityError"
        
        await send_error_to_user(self.interaction, error, "la création")
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        message = call_args[0][0]
        self.assertIn("Erreur de données", message)
        self.assertIn("Conflit de données", message)

    async def test_send_error_generic_error(self):
        """Test envoi d'erreur générique."""
        error = ValueError("Invalid parameter")
        
        await send_error_to_user(self.interaction, error, "la validation")
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        message = call_args[0][0]
        self.assertIn("Erreur (ValueError)", message)
        self.assertIn("Invalid parameter", message)

    async def test_send_error_response_already_done(self):
        """Test envoi d'erreur quand response.is_done() = True."""
        self.interaction.response.is_done.return_value = True
        error = Exception("Test error")
        
        await send_error_to_user(self.interaction, error)
        
        # Vérifier que followup est utilisé au lieu de response
        self.interaction.followup.send.assert_called_once()
        self.interaction.response.send_message.assert_not_called()

    async def test_send_error_send_fails(self):
        """Test quand l'envoi du message d'erreur échoue."""
        self.interaction.response.send_message.side_effect = Exception("Send failed")
        error = Exception("Original error")
        
        # Ne devrait pas lever d'exception
        await send_error_to_user(self.interaction, error)
        
        self.interaction.response.send_message.assert_called_once()


class TestSlashCommandsWatch(TestSlashCommandsBase):
    """Tests pour la commande /watch."""

    def setUp(self):
        super().setUp()
        self.link_info = MessageLinkInfo(self.guild.id, self.channel.id, self.message.id)

    @patch("commands.slash_commands.has_admin_permission")
    async def test_watch_no_permission(self, mock_has_admin):
        """Test /watch sans permissions administrateur."""
        mock_has_admin.return_value = False
        
        await self.slash_commands.watch(self.interaction, "test_message", 3600)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("Vous devez avoir l'un de ces rôles", call_args[0][0])
        self.assertTrue(call_args[1]["ephemeral"])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.validate_message_link")
    async def test_watch_invalid_link(self, mock_validate, mock_has_admin):
        """Test /watch avec lien invalide."""
        mock_has_admin.return_value = True
        mock_validate.side_effect = ValidationError("Invalid link")
        
        with patch("commands.slash_commands.get_validation_error_embed") as mock_embed:
            mock_embed.return_value = Mock()
            await self.slash_commands.watch(self.interaction, "invalid_link", 3600)
        
        self.interaction.response.send_message.assert_called_once()
        mock_embed.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.validate_message_link")
    async def test_watch_wrong_server(self, mock_validate, mock_has_admin):
        """Test /watch avec message d'un autre serveur."""
        mock_has_admin.return_value = True
        wrong_server_link = MessageLinkInfo(99999, self.channel.id, self.message.id)
        mock_validate.return_value = wrong_server_link
        
        await self.slash_commands.watch(self.interaction, "message_link", 3600)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("doit être du même serveur", call_args[0][0])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.validate_message_link")
    @patch("commands.slash_commands.safe_fetch_message")
    @patch("commands.slash_commands.extract_message_title")
    @patch("commands.slash_commands.reminder_manager")
    @patch("commands.slash_commands.get_scheduler_functions")
    async def test_watch_success_new_event(self, mock_scheduler, mock_reminder_mgr, 
                                         mock_extract_title, mock_safe_fetch, 
                                         mock_validate, mock_has_admin):
        """Test /watch réussi pour un nouvel événement."""
        # Configuration des mocks
        mock_has_admin.return_value = True
        mock_validate.return_value = self.link_info
        mock_safe_fetch.return_value = self.message
        mock_extract_title.return_value = "Test Event"
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=None)  # Nouvel événement
        mock_reminder_mgr.add_reminder = AsyncMock(return_value=True)
        mock_scheduler.return_value = (None, Mock(), None)
        
        # Mock des membres de la guild
        member = Mock()
        member.id = 1001
        member.bot = False
        self.guild.members = [member]
        
        await self.slash_commands.watch(self.interaction, "message_link", 3600)
        
        # Vérifications
        self.interaction.response.defer.assert_called_once()
        mock_reminder_mgr.add_reminder.assert_called_once()
        self.interaction.followup.send.assert_called_once()
        
        # Vérifier que l'embed de succès est envoyé
        call_args = self.interaction.followup.send.call_args
        self.assertTrue("embed" in call_args[1])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.validate_message_link")
    @patch("commands.slash_commands.safe_fetch_message")
    @patch("commands.slash_commands.reminder_manager")
    async def test_watch_success_update_existing(self, mock_reminder_mgr, mock_safe_fetch,
                                                mock_validate, mock_has_admin):
        """Test /watch réussi pour mise à jour d'un événement existant."""
        # Configuration des mocks
        mock_has_admin.return_value = True
        mock_validate.return_value = self.link_info
        mock_safe_fetch.return_value = self.message
        
        # Event existant
        existing_event = Mock()
        existing_event.interval_minutes = 30
        existing_event.title = "Existing Event"
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=existing_event)
        mock_reminder_mgr.update_reminder_interval = AsyncMock(return_value=True)
        
        with patch("commands.slash_commands.get_scheduler_functions") as mock_scheduler:
            mock_scheduler.return_value = (None, Mock(), None)
            await self.slash_commands.watch(self.interaction, "message_link", 7200)
        
        # Vérifications
        mock_reminder_mgr.update_reminder_interval.assert_called_once()
        self.interaction.followup.send.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.validate_message_link")  
    @patch("commands.slash_commands.safe_fetch_message")
    async def test_watch_channel_not_found(self, mock_safe_fetch, mock_validate, mock_has_admin):
        """Test /watch quand le canal n'existe pas."""
        mock_has_admin.return_value = True
        mock_validate.return_value = self.link_info
        self.bot.get_channel.return_value = None  # Canal introuvable
        
        await self.slash_commands.watch(self.interaction, "message_link", 3600)
        
        self.interaction.response.defer.assert_called_once()
        self.interaction.followup.send.assert_called_once()
        call_args = self.interaction.followup.send.call_args
        self.assertIn("Canal introuvable", call_args[0][0])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.validate_message_link")
    @patch("commands.slash_commands.safe_fetch_message")
    async def test_watch_message_not_found(self, mock_safe_fetch, mock_validate, mock_has_admin):
        """Test /watch quand le message n'existe pas."""
        mock_has_admin.return_value = True
        mock_validate.return_value = self.link_info
        mock_safe_fetch.return_value = None  # Message introuvable
        
        await self.slash_commands.watch(self.interaction, "message_link", 3600)
        
        self.interaction.response.defer.assert_called_once()
        self.interaction.followup.send.assert_called_once()
        call_args = self.interaction.followup.send.call_args
        self.assertIn("Message introuvable", call_args[0][0])


class TestSlashCommandsUnwatch(TestSlashCommandsBase):
    """Tests pour la commande /unwatch."""

    @patch("commands.slash_commands.has_admin_permission")
    async def test_unwatch_no_permission(self, mock_has_admin):
        """Test /unwatch sans permissions."""
        mock_has_admin.return_value = False
        
        await self.slash_commands.unwatch(self.interaction, "message_link")
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("Vous devez avoir l'un de ces rôles", call_args[0][0])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    async def test_unwatch_invalid_link(self, mock_parse, mock_has_admin):
        """Test /unwatch avec lien invalide."""
        mock_has_admin.return_value = True
        mock_parse.return_value = None
        
        await self.slash_commands.unwatch(self.interaction, "invalid_link")
        
        self.interaction.response.send_message.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    async def test_unwatch_event_not_watched(self, mock_reminder_mgr, mock_parse, mock_has_admin):
        """Test /unwatch pour événement non surveillé."""
        mock_has_admin.return_value = True
        mock_parse.return_value = self.link_info
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=None)
        
        await self.slash_commands.unwatch(self.interaction, "message_link")
        
        self.interaction.response.send_message.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    @patch("commands.slash_commands.get_scheduler_functions")
    async def test_unwatch_success(self, mock_scheduler, mock_reminder_mgr, mock_parse, mock_has_admin):
        """Test /unwatch réussi."""
        mock_has_admin.return_value = True
        mock_parse.return_value = self.link_info
        
        existing_event = Mock()
        existing_event.title = "Test Event"
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=existing_event)
        mock_reminder_mgr.remove_reminder = AsyncMock(return_value=True)
        mock_scheduler.return_value = (None, Mock(), None)
        
        await self.slash_commands.unwatch(self.interaction, "message_link")
        
        mock_reminder_mgr.remove_reminder.assert_called_once()
        self.interaction.response.send_message.assert_called_once()
        # Vérifier que l'embed de succès est envoyé
        call_args = self.interaction.response.send_message.call_args
        self.assertTrue("embed" in call_args[1])


class TestSlashCommandsList(TestSlashCommandsBase):
    """Tests pour la commande /list."""

    @patch("commands.slash_commands.reminder_manager")
    async def test_list_no_events(self, mock_reminder_mgr):
        """Test /list sans événements surveillés."""
        mock_reminder_mgr.get_guild_reminders = AsyncMock(return_value={})
        
        await self.slash_commands.list_events(self.interaction)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("Aucun événement surveillé", call_args[0][0])

    @patch("commands.slash_commands.reminder_manager")
    async def test_list_with_events(self, mock_reminder_mgr):
        """Test /list avec événements surveillés."""
        # Mock event
        event = Mock()
        event.title = "Test Event"
        event.channel_id = self.channel.id
        event.interval_minutes = 60
        event.is_paused = False
        event.get_response_count.return_value = 5
        event.get_total_users_count.return_value = 10
        event.get_status_summary.return_value = {"response_percentage": 50}
        event.get_next_reminder_time.return_value = datetime.now() + timedelta(hours=1)
        event.update_accessible_users = AsyncMock()
        event.guild_id = self.guild.id
        
        mock_reminder_mgr.get_guild_reminders = AsyncMock(return_value={"12345": event})
        
        await self.slash_commands.list_events(self.interaction)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertTrue("embed" in call_args[1])

    @patch("commands.slash_commands.reminder_manager")
    async def test_list_with_paused_event(self, mock_reminder_mgr):
        """Test /list avec événement en pause."""
        event = Mock()
        event.title = "Paused Event"
        event.channel_id = self.channel.id
        event.interval_minutes = 60
        event.is_paused = True  # En pause
        event.get_response_count.return_value = 3
        event.get_total_users_count.return_value = 8
        event.get_status_summary.return_value = {"response_percentage": 38}
        event.get_next_reminder_time.return_value = datetime.now() + timedelta(hours=1)
        event.update_accessible_users = AsyncMock()
        event.guild_id = self.guild.id
        
        mock_reminder_mgr.get_guild_reminders = AsyncMock(return_value={"54321": event})
        
        await self.slash_commands.list_events(self.interaction)
        
        self.interaction.response.send_message.assert_called_once()


class TestSlashCommandsRemind(TestSlashCommandsBase):
    """Tests pour la commande /remind."""

    @patch("commands.slash_commands.has_admin_permission")
    async def test_remind_no_permission(self, mock_has_admin):
        """Test /remind sans permissions."""
        mock_has_admin.return_value = False
        
        await self.slash_commands.remind(self.interaction)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("Vous devez avoir l'un de ces rôles", call_args[0][0])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    async def test_remind_invalid_link(self, mock_parse, mock_has_admin):
        """Test /remind avec lien invalide."""
        mock_has_admin.return_value = True
        mock_parse.return_value = None
        
        await self.slash_commands.remind(self.interaction, "invalid_link")
        
        self.interaction.response.defer.assert_called_once()
        self.interaction.followup.send.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.reminder_manager")
    async def test_remind_no_events_to_remind(self, mock_reminder_mgr, mock_has_admin):
        """Test /remind sans événements à rappeler."""
        mock_has_admin.return_value = True
        mock_reminder_mgr.get_guild_reminders = AsyncMock(return_value={})
        
        await self.slash_commands.remind(self.interaction)
        
        self.interaction.response.defer.assert_called_once()
        self.interaction.followup.send.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.reminder_manager")
    @patch("commands.slash_commands.get_or_create_reminder_channel")
    @patch("commands.slash_commands.send_reminder")
    async def test_remind_success(self, mock_send_reminder, mock_get_channel, 
                                 mock_reminder_mgr, mock_has_admin):
        """Test /remind réussi."""
        mock_has_admin.return_value = True
        
        # Mock event
        event = Mock()
        event.channel_id = self.channel.id
        mock_reminder_mgr.get_guild_reminders = AsyncMock(return_value={"12345": event})
        
        # Mock reminder channel et send_reminder
        mock_get_channel.return_value = self.channel
        mock_send_reminder.return_value = 5  # 5 personnes notifiées
        
        with patch("commands.slash_commands.Settings") as mock_settings:
            mock_settings.USE_SEPARATE_REMINDER_CHANNEL = False
            mock_settings.REMINDER_DELAY_SECONDS = 0
            await self.slash_commands.remind(self.interaction)
        
        self.interaction.response.defer.assert_called_once()
        mock_send_reminder.assert_called_once()
        self.interaction.followup.send.assert_called_once()


class TestSlashCommandsSetInterval(TestSlashCommandsBase):
    """Tests pour la commande /set_interval."""

    @patch("commands.slash_commands.has_admin_permission")
    async def test_set_interval_no_permission(self, mock_has_admin):
        """Test /set_interval sans permissions."""
        mock_has_admin.return_value = False
        
        await self.slash_commands.set_interval(self.interaction, "message_link", 3600)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("Vous devez avoir l'un de ces rôles", call_args[0][0])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    async def test_set_interval_invalid_link(self, mock_parse, mock_has_admin):
        """Test /set_interval avec lien invalide."""
        mock_has_admin.return_value = True
        mock_parse.return_value = None
        
        await self.slash_commands.set_interval(self.interaction, "invalid_link", 3600)
        
        self.interaction.response.send_message.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    async def test_set_interval_event_not_watched(self, mock_reminder_mgr, mock_parse, mock_has_admin):
        """Test /set_interval pour événement non surveillé."""
        mock_has_admin.return_value = True
        mock_parse.return_value = self.link_info
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=None)
        
        await self.slash_commands.set_interval(self.interaction, "message_link", 3600)
        
        self.interaction.response.send_message.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    @patch("commands.slash_commands.get_scheduler_functions")
    async def test_set_interval_success(self, mock_scheduler, mock_reminder_mgr, 
                                       mock_parse, mock_has_admin):
        """Test /set_interval réussi."""
        mock_has_admin.return_value = True
        mock_parse.return_value = self.link_info
        
        # Mock existing event
        event = Mock()
        event.guild_id = self.guild.id
        event.interval_minutes = 60
        event.title = "Test Event"
        event.get_next_reminder_time.return_value = datetime.now() + timedelta(hours=1)
        
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=event)
        mock_reminder_mgr.update_reminder_interval = AsyncMock(return_value=True)
        mock_scheduler.return_value = (None, Mock(), None)
        
        await self.slash_commands.set_interval(self.interaction, "message_link", 7200)
        
        mock_reminder_mgr.update_reminder_interval.assert_called_once()
        self.interaction.response.send_message.assert_called_once()


class TestSlashCommandsPause(TestSlashCommandsBase):
    """Tests pour la commande /pause."""

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    @patch("commands.slash_commands.get_scheduler_functions")
    async def test_pause_success(self, mock_scheduler, mock_reminder_mgr, mock_parse, mock_has_admin):
        """Test /pause réussi."""
        mock_has_admin.return_value = True
        mock_parse.return_value = self.link_info
        
        # Mock existing event (not paused)
        event = Mock()
        event.guild_id = self.guild.id
        event.is_paused = False
        event.title = "Test Event"
        
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=event)
        mock_reminder_mgr.pause_reminder = AsyncMock(return_value=True)
        mock_scheduler.return_value = (None, Mock(), None)
        
        await self.slash_commands.pause(self.interaction, "message_link")
        
        mock_reminder_mgr.pause_reminder.assert_called_once()
        self.interaction.response.send_message.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    async def test_pause_already_paused(self, mock_reminder_mgr, mock_parse, mock_has_admin):
        """Test /pause sur événement déjà en pause."""
        mock_has_admin.return_value = True
        mock_parse.return_value = self.link_info
        
        # Mock existing event (already paused)
        event = Mock()
        event.guild_id = self.guild.id
        event.is_paused = True  # Déjà en pause
        
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=event)
        
        await self.slash_commands.pause(self.interaction, "message_link")
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("déjà en pause", call_args[0][0])


class TestSlashCommandsResume(TestSlashCommandsBase):
    """Tests pour la commande /resume."""

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    @patch("commands.slash_commands.get_scheduler_functions")
    async def test_resume_success(self, mock_scheduler, mock_reminder_mgr, mock_parse, mock_has_admin):
        """Test /resume réussi."""
        mock_has_admin.return_value = True
        mock_parse.return_value = self.link_info
        
        # Mock existing event (paused)
        event = Mock()
        event.guild_id = self.guild.id
        event.is_paused = True
        event.title = "Test Event"
        event.get_next_reminder_time.return_value = datetime.now() + timedelta(hours=1)
        
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=event)
        mock_reminder_mgr.resume_reminder = AsyncMock(return_value=True)
        mock_scheduler.return_value = (None, Mock(), None)
        
        await self.slash_commands.resume(self.interaction, "message_link")
        
        mock_reminder_mgr.resume_reminder.assert_called_once()
        self.interaction.response.send_message.assert_called_once()

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    async def test_resume_not_paused(self, mock_reminder_mgr, mock_parse, mock_has_admin):
        """Test /resume sur événement non en pause."""
        mock_has_admin.return_value = True
        mock_parse.return_value = self.link_info
        
        # Mock existing event (not paused)
        event = Mock()
        event.guild_id = self.guild.id
        event.is_paused = False  # Pas en pause
        
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=event)
        
        await self.slash_commands.resume(self.interaction, "message_link")
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("n'est pas en pause", call_args[0][0])


class TestSlashCommandsDbStatus(TestSlashCommandsBase):
    """Tests pour la commande /db_status."""

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.get_backend_info")
    @patch("commands.slash_commands.event_manager_adapter")
    async def test_db_status_success(self, mock_adapter, mock_backend_info, mock_has_admin):
        """Test /db_status réussi."""
        mock_has_admin.return_value = True
        mock_backend_info.return_value = {
            "backend_type": "SQLite",
            "database_path": "/path/to/db.sqlite",
            "database_size": 2.5
        }
        mock_adapter.get_stats.return_value = {
            "total_events": 10,
            "active_events": 8,
            "paused_events": 2,
            "guilds_with_events": 3
        }
        
        await self.slash_commands.db_status(self.interaction)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertTrue("embed" in call_args[1])

    @patch("commands.slash_commands.has_admin_permission")
    async def test_db_status_no_permission(self, mock_has_admin):
        """Test /db_status sans permissions."""
        mock_has_admin.return_value = False
        
        await self.slash_commands.db_status(self.interaction)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertIn("Vous devez avoir l'un de ces rôles", call_args[0][0])


class TestSlashCommandsDbOptimize(TestSlashCommandsBase):
    """Tests pour la commande /db_optimize."""

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.get_backend_info")
    @patch("commands.slash_commands.get_database")
    async def test_db_optimize_success(self, mock_get_db, mock_backend_info, mock_has_admin):
        """Test /db_optimize réussi."""
        mock_has_admin.return_value = True
        mock_backend_info.return_value = {
            "backend_type": "SQLite",
            "database_size": 2.0
        }
        
        # Mock database
        mock_db = Mock()
        mock_db.execute_sql = Mock()
        mock_get_db.return_value = mock_db
        
        await self.slash_commands.db_optimize(self.interaction)
        
        self.interaction.response.defer.assert_called_once()
        self.interaction.followup.send.assert_called_once()
        
        # Vérifier que VACUUM et ANALYZE ont été exécutés
        calls = mock_db.execute_sql.call_args_list
        self.assertEqual(len(calls), 2)
        self.assertIn("VACUUM", calls[0][0][0])
        self.assertIn("ANALYZE", calls[1][0][0])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.get_backend_info")
    async def test_db_optimize_not_sqlite(self, mock_backend_info, mock_has_admin):
        """Test /db_optimize avec backend non SQLite."""
        mock_has_admin.return_value = True
        mock_backend_info.return_value = {"backend_type": "JSON"}
        
        await self.slash_commands.db_optimize(self.interaction)
        
        self.interaction.response.defer.assert_called_once()
        self.interaction.followup.send.assert_called_once()
        call_args = self.interaction.followup.send.call_args
        self.assertIn("disponible que pour les bases de données SQLite", call_args[0][0])


class TestSlashCommandsHelp(TestSlashCommandsBase):
    """Tests pour la commande /help."""

    @patch("commands.slash_commands.reminder_manager")
    async def test_help_in_guild(self, mock_reminder_mgr):
        """Test /help dans un serveur."""
        mock_reminder_mgr.get_guild_reminders = AsyncMock(return_value={"1": Mock(), "2": Mock()})
        
        await self.slash_commands.help(self.interaction)
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertTrue("embed" in call_args[1])
        
        # Vérifier que les statistiques du serveur sont incluses
        embed = call_args[1]["embed"]
        footer_text = embed.set_footer.call_args[1]["text"]
        self.assertIn("2 rappel(s) actifs sur ce serveur", footer_text)

    @patch("commands.slash_commands.reminder_manager")
    async def test_help_in_dm(self, mock_reminder_mgr):
        """Test /help en message privé."""
        self.interaction.guild = None  # DM
        mock_reminder_mgr.reminders = {"1": Mock(), "2": Mock(), "3": Mock()}
        
        await self.slash_commands.help(self.interaction)
        
        self.interaction.response.send_message.assert_called_once()


class TestSlashCommandsSync(TestSlashCommandsBase):
    """Tests pour la commande /sync."""

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.sync_slash_commands_logic")
    async def test_sync_success(self, mock_sync_logic, mock_has_admin):
        """Test /sync réussi."""
        mock_has_admin.return_value = True
        mock_sync_logic.return_value = ["command1", "command2", "command3"]
        
        await self.slash_commands.sync(self.interaction)
        
        self.interaction.response.defer.assert_called_once()
        self.interaction.followup.send.assert_called_once()
        
        call_args = self.interaction.followup.send.call_args
        self.assertTrue("embed" in call_args[1])

    @patch("commands.slash_commands.has_admin_permission")
    @patch("commands.slash_commands.sync_slash_commands_logic")
    async def test_sync_failure(self, mock_sync_logic, mock_has_admin):
        """Test /sync avec échec."""
        mock_has_admin.return_value = True
        mock_sync_logic.side_effect = Exception("Sync failed")
        
        await self.slash_commands.sync(self.interaction)
        
        self.interaction.response.defer.assert_called_once()
        self.interaction.followup.send.assert_called_once()
        
        call_args = self.interaction.followup.send.call_args
        embed = call_args[1]["embed"]
        # Vérifier que c'est un embed d'erreur
        self.assertEqual(embed.title, "❌ Erreur de synchronisation")


class TestSlashCommandsStatus(TestSlashCommandsBase):
    """Tests pour la commande /status."""

    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    async def test_status_success(self, mock_reminder_mgr, mock_parse):
        """Test /status réussi."""
        mock_parse.return_value = self.link_info
        
        # Mock event avec status
        event = Mock()
        event.guild_id = self.guild.id
        event.update_accessible_users = AsyncMock()
        event.get_status_summary.return_value = {
            "title": "Test Event",
            "is_paused": False,
            "is_overdue": False,
            "channel_id": self.channel.id,
            "interval_minutes": 60,
            "response_count": 5,
            "total_count": 10,
            "response_percentage": 50,
            "next_reminder": datetime.now() + timedelta(hours=1),
            "created_at": datetime.now(),
            "guild_id": self.guild.id,
            "message_id": self.message.id
        }
        
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=event)
        
        await self.slash_commands.status(self.interaction, "message_link")
        
        self.interaction.response.send_message.assert_called_once()
        call_args = self.interaction.response.send_message.call_args
        self.assertTrue("embed" in call_args[1])

    @patch("commands.slash_commands.parse_message_link")
    @patch("commands.slash_commands.reminder_manager")
    async def test_status_event_not_found(self, mock_reminder_mgr, mock_parse):
        """Test /status pour événement non trouvé."""
        mock_parse.return_value = self.link_info
        mock_reminder_mgr.get_reminder = AsyncMock(return_value=None)
        
        await self.slash_commands.status(self.interaction, "message_link")
        
        self.interaction.response.send_message.assert_called_once()

    @patch("commands.slash_commands.parse_message_link")
    async def test_status_invalid_link(self, mock_parse):
        """Test /status avec lien invalide."""
        mock_parse.return_value = None
        
        await self.slash_commands.status(self.interaction, "invalid_link")
        
        self.interaction.response.send_message.assert_called_once()


if __name__ == "__main__":
    import unittest
    unittest.main()