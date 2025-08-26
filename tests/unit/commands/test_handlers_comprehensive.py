"""
Tests unitaires complets pour le module commands/handlers.py

Ce module teste tous les aspects des handlers de commandes, incluant :
- Fonctions de planification des rappels
- Gestion des canaux de rappel
- Envoi de rappels et notifications
- Gestion des erreurs et récupération
- Logique de planification dynamique
- Toutes les commandes bot définies dans setup_bot_handlers
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
from discord.ext import commands

from commands.handlers import (
    check_reminders_dynamic,
    get_or_create_reminder_channel,
    reschedule_reminders,
    schedule_next_reminder_check,
    send_error_to_user,
    send_reminder,
    setup_bot_handlers,
    start_dynamic_reminder_system,
    sync_slash_commands,
)
from config.settings import Messages, Settings
from models.database_models import Event
from utils.message_parser import MessageLinkInfo
from utils.validation import ValidationError


class TestHandlersBase(IsolatedAsyncioTestCase):
    """Classe de base pour les tests de handlers."""

    def setUp(self):
        """Configuration initiale pour chaque test."""
        # Mock du bot Discord
        self.bot = Mock(spec=commands.Bot)
        self.bot.user = Mock()
        self.bot.user.id = 12345
        self.bot.get_channel = Mock()
        self.bot.get_guild = Mock()

        # Mock de la guild (serveur)
        self.guild = Mock(spec=discord.Guild)
        self.guild.id = 67890
        self.guild.name = "Test Server"
        self.guild.members = []
        self.guild.text_channels = []
        self.guild.create_text_channel = AsyncMock()

        # Mock du canal
        self.channel = Mock(spec=discord.TextChannel)
        self.channel.id = 11111
        self.channel.name = "test-channel"
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

        # Mock du contexte de commande
        self.ctx = Mock(spec=commands.Context)
        self.ctx.guild = self.guild
        self.ctx.author = self.user
        self.ctx.send = AsyncMock()
        self.ctx.bot = self.bot

        # Configuration par défaut pour les mocks
        self.bot.get_channel.return_value = self.channel
        self.bot.get_guild.return_value = self.guild

        # Mock reminder_manager par défaut
        self.reminder_manager_mock = Mock()
        self.reminder_manager_mock.get_reminder = AsyncMock(return_value=None)
        self.reminder_manager_mock.add_reminder = AsyncMock(return_value=True)
        self.reminder_manager_mock.remove_reminder = AsyncMock(return_value=True)
        self.reminder_manager_mock.get_guild_reminders = AsyncMock(return_value={})
        self.reminder_manager_mock.get_due_reminders = AsyncMock(return_value=[])
        self.reminder_manager_mock.load_from_storage = AsyncMock(return_value=True)
        self.reminder_manager_mock.save = AsyncMock(return_value=True)
        self.reminder_manager_mock.reminders = {}

        # Mock Event
        self.event = Mock(spec=Event)
        self.event.message_id = self.message.id
        self.event.channel_id = self.channel.id
        self.event.guild_id = self.guild.id
        self.event.title = "Test Event"
        self.event.interval_minutes = 60
        self.event.is_paused = False
        self.event.last_reminder = datetime.now()
        self.event.users_who_reacted = set()
        self.event.all_users = set()
        self.event.required_reactions = ["✅", "❌", "❓"]
        self.event.get_next_reminder_time = Mock(return_value=datetime.now() + timedelta(hours=1))
        self.event.get_missing_users = Mock(return_value=set())
        self.event.get_response_count = Mock(return_value=5)
        self.event.get_missing_count = Mock(return_value=3)
        self.event.get_total_users_count = Mock(return_value=8)
        self.event.get_response_percentage = Mock(return_value=62.5)
        self.event.update_accessible_users = AsyncMock()


class TestScheduleNextReminderCheck(TestHandlersBase):
    """Tests pour schedule_next_reminder_check."""

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers._dynamic_reminder_task")
    async def test_schedule_no_reminders(self, mock_task, mock_reminder_mgr):
        """Test planification sans rappels surveillés."""
        mock_reminder_mgr.reminders = {}
        
        await schedule_next_reminder_check()
        
        # Vérifier qu'aucune tâche n'est créée
        self.assertIsNone(mock_task)

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.asyncio.create_task")
    async def test_schedule_with_overdue_reminders(self, mock_create_task, mock_reminder_mgr):
        """Test planification avec rappels en retard."""
        # Mock reminder en retard
        overdue_event = Mock()
        overdue_event.is_paused = False
        overdue_event.get_next_reminder_time.return_value = datetime.now() - timedelta(minutes=5)
        overdue_event.message_id = 12345
        
        mock_reminder_mgr.reminders = {12345: overdue_event}
        mock_task = Mock()
        mock_create_task.return_value = mock_task
        mock_task.done.return_value = False
        
        await schedule_next_reminder_check()
        
        # Vérifier qu'une tâche est créée pour traiter les rappels en retard
        mock_create_task.assert_called()

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.asyncio.create_task")
    @patch("commands.handlers.asyncio.sleep")
    async def test_schedule_with_future_reminders(self, mock_sleep, mock_create_task, mock_reminder_mgr):
        """Test planification avec rappels futurs."""
        # Mock reminder futur
        future_event = Mock()
        future_event.is_paused = False
        future_event.get_next_reminder_time.return_value = datetime.now() + timedelta(minutes=30)
        future_event.message_id = 12345
        
        mock_reminder_mgr.reminders = {12345: future_event}
        mock_task = Mock()
        mock_create_task.return_value = mock_task
        
        await schedule_next_reminder_check()
        
        # Vérifier qu'une tâche de sleep est créée
        mock_create_task.assert_called()

    @patch("commands.handlers.reminder_manager")
    async def test_schedule_all_paused_reminders(self, mock_reminder_mgr):
        """Test planification avec tous les rappels en pause."""
        # Mock reminder en pause
        paused_event = Mock()
        paused_event.is_paused = True
        paused_event.message_id = 12345
        
        mock_reminder_mgr.reminders = {12345: paused_event}
        
        await schedule_next_reminder_check()
        
        # Pas de vérifications spécifiques car la fonction entre en mode veille


class TestCheckRemindersDynamic(TestHandlersBase):
    """Tests pour check_reminders_dynamic."""

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.bot")
    @patch("commands.handlers.send_reminder")
    @patch("commands.handlers.get_or_create_reminder_channel")
    @patch("commands.handlers.schedule_next_reminder_check")
    async def test_check_no_due_reminders(self, mock_schedule, mock_get_channel, 
                                         mock_send_reminder, mock_bot, mock_reminder_mgr):
        """Test vérification sans rappels dus."""
        mock_reminder_mgr.get_due_reminders.return_value = []
        mock_reminder_mgr.reminders = {}
        
        await check_reminders_dynamic()
        
        mock_send_reminder.assert_not_called()
        mock_schedule.assert_called_once()

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.bot")
    @patch("commands.handlers.send_reminder")
    @patch("commands.handlers.get_or_create_reminder_channel")
    @patch("commands.handlers.schedule_next_reminder_check")
    @patch("commands.handlers.Settings")
    async def test_check_with_due_reminders(self, mock_settings, mock_schedule, 
                                           mock_get_channel, mock_send_reminder, 
                                           mock_bot, mock_reminder_mgr):
        """Test vérification avec rappels dus."""
        mock_settings.USE_SEPARATE_REMINDER_CHANNEL = False
        mock_settings.REMINDER_DELAY_SECONDS = 0
        
        mock_reminder_mgr.get_due_reminders.return_value = [self.event]
        mock_bot.get_guild.return_value = self.guild
        mock_bot.get_channel.return_value = self.channel
        mock_send_reminder.return_value = 3  # 3 personnes notifiées
        
        await check_reminders_dynamic()
        
        mock_send_reminder.assert_called_once_with(self.event, self.channel, mock_bot)
        mock_schedule.assert_called_once()

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.bot")
    @patch("commands.handlers.send_reminder")
    @patch("commands.handlers.get_or_create_reminder_channel")
    @patch("commands.handlers.Settings")
    async def test_check_with_separate_reminder_channel(self, mock_settings, mock_get_channel,
                                                       mock_send_reminder, mock_bot, mock_reminder_mgr):
        """Test vérification avec canal de rappel séparé."""
        mock_settings.USE_SEPARATE_REMINDER_CHANNEL = True
        mock_settings.REMINDER_DELAY_SECONDS = 0
        
        reminder_channel = Mock()
        mock_get_channel.return_value = reminder_channel
        mock_reminder_mgr.get_due_reminders.return_value = [self.event]
        mock_bot.get_guild.return_value = self.guild
        mock_send_reminder.return_value = 2
        
        await check_reminders_dynamic(reschedule_after=False)
        
        mock_get_channel.assert_called_once_with(self.guild)
        mock_send_reminder.assert_called_once_with(self.event, reminder_channel, mock_bot)

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.bot")
    async def test_check_guild_not_found(self, mock_bot, mock_reminder_mgr):
        """Test vérification quand la guild n'est pas trouvée."""
        mock_reminder_mgr.get_due_reminders.return_value = [self.event]
        mock_bot.get_guild.return_value = None  # Guild introuvable
        
        await check_reminders_dynamic(reschedule_after=False)
        
        # Pas d'exception levée, le rappel est ignoré


class TestStartDynamicReminderSystem(TestHandlersBase):
    """Tests pour start_dynamic_reminder_system."""

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.schedule_next_reminder_check")
    async def test_start_with_existing_reminders(self, mock_schedule, mock_reminder_mgr):
        """Test démarrage avec rappels existants."""
        mock_reminder_mgr.load_from_storage.return_value = True
        mock_reminder_mgr.reminders = {12345: self.event}
        
        await start_dynamic_reminder_system()
        
        mock_reminder_mgr.load_from_storage.assert_called_once()
        mock_schedule.assert_called_once()

    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.schedule_next_reminder_check")
    async def test_start_no_reminders(self, mock_schedule, mock_reminder_mgr):
        """Test démarrage sans rappels."""
        mock_reminder_mgr.load_from_storage.return_value = True
        mock_reminder_mgr.reminders = {}
        
        await start_dynamic_reminder_system()
        
        mock_reminder_mgr.load_from_storage.assert_called_once()
        mock_schedule.assert_not_called()

    @patch("commands.handlers.reminder_manager")
    async def test_start_load_failure(self, mock_reminder_mgr):
        """Test démarrage avec échec de chargement."""
        mock_reminder_mgr.load_from_storage.return_value = False
        
        await start_dynamic_reminder_system()
        
        mock_reminder_mgr.load_from_storage.assert_called_once()


class TestRescheduleReminders(TestHandlersBase):
    """Tests pour reschedule_reminders."""

    @patch("commands.handlers.get_scheduler_functions")
    def test_reschedule_reminders(self, mock_get_scheduler):
        """Test replanification des rappels."""
        mock_reschedule_func = Mock()
        mock_get_scheduler.return_value = (None, mock_reschedule_func, None)
        
        reschedule_reminders()
        
        mock_get_scheduler.assert_called_once()
        mock_reschedule_func.assert_called_once()


class TestSyncSlashCommands(TestHandlersBase):
    """Tests pour sync_slash_commands."""

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.sync_slash_commands_logic")
    async def test_sync_success(self, mock_sync_logic, mock_has_admin):
        """Test synchronisation réussie."""
        mock_has_admin.return_value = True
        mock_sync_logic.return_value = ["cmd1", "cmd2", "cmd3"]
        
        await sync_slash_commands(self.ctx)
        
        mock_sync_logic.assert_called_once_with(self.ctx.bot)
        self.ctx.send.assert_called_once()
        call_args = self.ctx.send.call_args[0][0]
        self.assertIn("3 commande(s) slash synchronisée(s)", call_args)

    @patch("commands.handlers.has_admin_permission")
    async def test_sync_no_permission(self, mock_has_admin):
        """Test synchronisation sans permissions."""
        mock_has_admin.return_value = False
        
        await sync_slash_commands(self.ctx)
        
        self.ctx.send.assert_called_once()
        call_args = self.ctx.send.call_args[0][0]
        self.assertIn("Vous devez avoir l'un de ces rôles", call_args)

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.sync_slash_commands_logic")
    async def test_sync_failure(self, mock_sync_logic, mock_has_admin):
        """Test synchronisation avec échec."""
        mock_has_admin.return_value = True
        mock_sync_logic.side_effect = Exception("Sync failed")
        
        await sync_slash_commands(self.ctx)
        
        self.ctx.send.assert_called_once()
        call_args = self.ctx.send.call_args[0][0]
        self.assertIn("Erreur lors de la synchronisation", call_args)


class TestSendErrorToUser(TestHandlersBase):
    """Tests pour send_error_to_user."""

    async def test_send_error_database_error(self):
        """Test envoi d'erreur pour erreur de base de données."""
        error = Exception("database connection failed")
        
        await send_error_to_user(self.channel, error, "l'ajout d'événement")
        
        self.channel.send.assert_called_once()
        call_args = self.channel.send.call_args[0][0]
        self.assertIn("Erreur de base de données", call_args)
        self.assertIn("lors de l'ajout d'événement", call_args)

    async def test_send_error_sqlite_error(self):
        """Test envoi d'erreur pour erreur SQLite."""
        error = Exception("sqlite3.OperationalError")
        
        await send_error_to_user(self.channel, error, "la requête")
        
        self.channel.send.assert_called_once()
        call_args = self.channel.send.call_args[0][0]
        self.assertIn("Erreur de base de données", call_args)

    async def test_send_error_integrity_error(self):
        """Test envoi d'erreur pour IntegrityError."""
        error = Exception("Constraint violation")
        error.__class__.__name__ = "IntegrityError"
        
        await send_error_to_user(self.channel, error, "la création")
        
        self.channel.send.assert_called_once()
        call_args = self.channel.send.call_args[0][0]
        self.assertIn("Erreur de données", call_args)
        self.assertIn("Conflit de données", call_args)

    async def test_send_error_generic_error(self):
        """Test envoi d'erreur générique."""
        error = ValueError("Invalid parameter")
        
        await send_error_to_user(self.channel, error, "la validation")
        
        self.channel.send.assert_called_once()
        call_args = self.channel.send.call_args[0][0]
        self.assertIn("Erreur (ValueError)", call_args)
        self.assertIn("Invalid parameter", call_args)

    async def test_send_error_with_interaction(self):
        """Test envoi d'erreur avec interaction Discord."""
        interaction = Mock()
        interaction.response = Mock()
        interaction.response.is_done.return_value = False
        interaction.response.send_message = AsyncMock()
        
        error = Exception("Test error")
        
        await send_error_to_user(interaction, error)
        
        interaction.response.send_message.assert_called_once()
        call_args = interaction.response.send_message.call_args
        self.assertTrue(call_args[1]["ephemeral"])

    async def test_send_error_interaction_response_done(self):
        """Test envoi d'erreur avec interaction response déjà faite."""
        interaction = Mock()
        interaction.response = Mock()
        interaction.response.is_done.return_value = True
        interaction.followup = Mock()
        interaction.followup.send = AsyncMock()
        
        error = Exception("Test error")
        
        await send_error_to_user(interaction, error)
        
        interaction.followup.send.assert_called_once()
        call_args = interaction.followup.send.call_args
        self.assertTrue(call_args[1]["ephemeral"])

    async def test_send_error_send_fails(self):
        """Test quand l'envoi du message d'erreur échoue."""
        self.channel.send = AsyncMock(side_effect=Exception("Send failed"))
        error = Exception("Original error")
        
        # Ne devrait pas lever d'exception
        await send_error_to_user(self.channel, error)
        
        self.channel.send.assert_called_once()


class TestGetOrCreateReminderChannel(TestHandlersBase):
    """Tests pour get_or_create_reminder_channel."""

    @patch("commands.handlers.Settings")
    async def test_get_channel_disabled(self, mock_settings):
        """Test quand le canal séparé est désactivé."""
        mock_settings.USE_SEPARATE_REMINDER_CHANNEL = False
        
        result = await get_or_create_reminder_channel(self.guild)
        
        self.assertIsNone(result)

    @patch("commands.handlers.Settings")
    async def test_get_existing_channel(self, mock_settings):
        """Test récupération d'un canal existant."""
        mock_settings.USE_SEPARATE_REMINDER_CHANNEL = True
        mock_settings.REMINDER_CHANNEL_NAME = "rappels"
        
        existing_channel = Mock()
        existing_channel.name = "rappels"
        self.guild.text_channels = [existing_channel]
        
        result = await get_or_create_reminder_channel(self.guild)
        
        self.assertEqual(result, existing_channel)

    @patch("commands.handlers.Settings")
    async def test_create_new_channel(self, mock_settings):
        """Test création d'un nouveau canal."""
        mock_settings.USE_SEPARATE_REMINDER_CHANNEL = True
        mock_settings.REMINDER_CHANNEL_NAME = "rappels"
        
        new_channel = Mock()
        self.guild.text_channels = []
        self.guild.create_text_channel.return_value = new_channel
        
        result = await get_or_create_reminder_channel(self.guild)
        
        self.guild.create_text_channel.assert_called_once()
        self.assertEqual(result, new_channel)

    @patch("commands.handlers.Settings")
    async def test_create_channel_no_permission(self, mock_settings):
        """Test création de canal sans permissions."""
        mock_settings.USE_SEPARATE_REMINDER_CHANNEL = True
        mock_settings.REMINDER_CHANNEL_NAME = "rappels"
        
        self.guild.text_channels = []
        self.guild.create_text_channel.side_effect = discord.Forbidden(Mock(), "Forbidden")
        
        result = await get_or_create_reminder_channel(self.guild)
        
        self.assertIsNone(result)


class TestSendReminder(TestHandlersBase):
    """Tests pour send_reminder."""

    @patch("commands.handlers.safe_fetch_message")
    @patch("commands.handlers.safe_send_message")
    @patch("commands.handlers.get_auto_delete_manager")
    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.Settings")
    async def test_send_reminder_success(self, mock_settings, mock_reminder_mgr, 
                                        mock_auto_delete, mock_safe_send, mock_safe_fetch):
        """Test envoi de rappel réussi."""
        mock_settings.MAX_MENTIONS_PER_REMINDER = 10
        mock_settings.MAX_TITLE_LENGTH = 100
        mock_settings.AUTO_DELETE_REMINDERS = False
        mock_settings.is_test_mode.return_value = False
        
        # Configuration des mocks
        mock_safe_fetch.return_value = self.message
        sent_message = Mock()
        mock_safe_send.return_value = sent_message
        
        # Mock des utilisateurs manquants
        self.event.get_missing_users.return_value = {1001, 1002, 1003}
        
        # Mock des réactions
        reaction = Mock()
        reaction.emoji = "✅"
        reaction.users.return_value = AsyncMock()
        reaction.users.return_value.__aiter__ = AsyncMock(return_value=iter([]))
        self.message.reactions = [reaction]
        
        result = await send_reminder(self.event, self.channel, self.bot)
        
        self.assertEqual(result, 3)  # 3 utilisateurs mentionnés
        mock_safe_send.assert_called_once()
        mock_reminder_mgr.save.assert_called_once()

    @patch("commands.handlers.safe_fetch_message")
    @patch("commands.handlers.reminder_manager")
    async def test_send_reminder_message_not_found(self, mock_reminder_mgr, mock_safe_fetch):
        """Test envoi de rappel quand le message n'existe plus."""
        mock_safe_fetch.return_value = None  # Message supprimé
        mock_reminder_mgr.remove_reminder.return_value = True
        
        result = await send_reminder(self.event, self.channel, self.bot)
        
        self.assertEqual(result, 0)
        mock_reminder_mgr.remove_reminder.assert_called_once_with(self.event.message_id)

    @patch("commands.handlers.safe_fetch_message")
    @patch("commands.handlers.safe_send_message")
    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.Settings")
    async def test_send_reminder_no_missing_users(self, mock_settings, mock_reminder_mgr,
                                                 mock_safe_send, mock_safe_fetch):
        """Test envoi de rappel sans utilisateurs manquants."""
        mock_safe_fetch.return_value = self.message
        self.event.get_missing_users.return_value = set()  # Pas d'utilisateurs manquants
        
        result = await send_reminder(self.event, self.channel, self.bot)
        
        self.assertEqual(result, 0)
        mock_safe_send.assert_not_called()

    @patch("commands.handlers.safe_fetch_message")
    @patch("commands.handlers.safe_send_message")
    @patch("commands.handlers.get_auto_delete_manager")
    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.Settings")
    async def test_send_reminder_with_auto_delete(self, mock_settings, mock_reminder_mgr,
                                                 mock_auto_delete, mock_safe_send, mock_safe_fetch):
        """Test envoi de rappel avec auto-suppression."""
        mock_settings.MAX_MENTIONS_PER_REMINDER = 10
        mock_settings.MAX_TITLE_LENGTH = 100
        mock_settings.AUTO_DELETE_REMINDERS = True
        mock_settings.AUTO_DELETE_DELAY_HOURS = 24
        mock_settings.format_auto_delete_display.return_value = "24 heures"
        mock_settings.is_test_mode.return_value = False
        
        mock_safe_fetch.return_value = self.message
        sent_message = Mock()
        sent_message.id = 99999
        mock_safe_send.return_value = sent_message
        
        auto_delete_mgr = Mock()
        auto_delete_mgr.schedule_deletion = AsyncMock(return_value=True)
        mock_auto_delete.return_value = auto_delete_mgr
        
        self.event.get_missing_users.return_value = {1001}
        self.message.reactions = []
        
        result = await send_reminder(self.event, self.channel, self.bot)
        
        self.assertEqual(result, 1)
        auto_delete_mgr.schedule_deletion.assert_called_once_with(sent_message)

    @patch("commands.handlers.safe_fetch_message")
    @patch("commands.handlers.safe_send_message")
    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.Settings")
    async def test_send_reminder_mention_limit_exceeded(self, mock_settings, mock_reminder_mgr,
                                                       mock_safe_send, mock_safe_fetch):
        """Test envoi de rappel avec limite de mentions dépassée."""
        mock_settings.MAX_MENTIONS_PER_REMINDER = 2  # Limite basse
        mock_settings.MAX_TITLE_LENGTH = 100
        mock_settings.AUTO_DELETE_REMINDERS = False
        mock_settings.is_test_mode.return_value = False
        
        mock_safe_fetch.return_value = self.message
        sent_message = Mock()
        mock_safe_send.return_value = sent_message
        
        # Plus d'utilisateurs que la limite
        self.event.get_missing_users.return_value = {1001, 1002, 1003, 1004, 1005}
        self.message.reactions = []
        
        result = await send_reminder(self.event, self.channel, self.bot)
        
        self.assertEqual(result, 2)  # Seulement 2 mentionnés (limite)

    @patch("commands.handlers.safe_fetch_message")
    @patch("commands.handlers.reminder_manager")
    async def test_send_reminder_exception_handling(self, mock_reminder_mgr, mock_safe_fetch):
        """Test gestion des exceptions dans send_reminder."""
        mock_safe_fetch.side_effect = Exception("Unexpected error")
        
        result = await send_reminder(self.event, self.channel, self.bot)
        
        self.assertEqual(result, 0)
        # Vérifier que le timestamp est mis à jour même en cas d'erreur
        mock_reminder_mgr.save.assert_called_once()


class TestSetupBotHandlers(TestHandlersBase):
    """Tests pour setup_bot_handlers et les commandes bot."""

    def setUp(self):
        super().setUp()
        # Mock pour les imports dans setup_bot_handlers
        self.patcher_event_manager = patch("commands.handlers.setup_event_manager_for_bot")
        self.patcher_slash_commands = patch("commands.handlers.register_slash_commands")
        self.mock_setup_event_manager = self.patcher_event_manager.start()
        self.mock_register_slash_commands = self.patcher_slash_commands.start()

    def tearDown(self):
        self.patcher_event_manager.stop()
        self.patcher_slash_commands.stop()

    def test_setup_bot_handlers(self):
        """Test configuration des handlers du bot."""
        setup_bot_handlers(self.bot)
        
        # Vérifier que les fonctions d'initialisation sont appelées
        self.mock_setup_event_manager.assert_called_once_with(self.bot)
        self.mock_register_slash_commands.assert_called_once_with(self.bot)

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.validate_message_link")
    @patch("commands.handlers.safe_fetch_message")
    @patch("commands.handlers.extract_message_title")
    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.reschedule_reminders")
    async def test_watch_command(self, mock_reschedule, mock_reminder_mgr, mock_extract_title,
                                mock_safe_fetch, mock_validate, mock_has_admin):
        """Test commande /watch."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande watch
        watch_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "watch":
                watch_command = command[0][0]
                break
        
        self.assertIsNotNone(watch_command)
        
        # Configuration des mocks
        mock_has_admin.return_value = True
        link_info = MessageLinkInfo(self.guild.id, self.channel.id, self.message.id)
        mock_validate.return_value = link_info
        mock_safe_fetch.return_value = self.message
        mock_extract_title.return_value = "Test Event"
        mock_reminder_mgr.add_reminder.return_value = True
        
        # Mock des membres de la guild
        member = Mock()
        member.id = 1001
        member.bot = False
        self.guild.members = [member]
        
        await watch_command(self.ctx, "message_link", 60)
        
        mock_reminder_mgr.add_reminder.assert_called_once()
        mock_reschedule.assert_called_once()
        self.ctx.send.assert_called()

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.parse_message_link")
    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.reschedule_reminders")
    async def test_unwatch_command(self, mock_reschedule, mock_reminder_mgr, 
                                  mock_parse, mock_has_admin):
        """Test commande /unwatch."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande unwatch
        unwatch_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "unwatch":
                unwatch_command = command[0][0]
                break
        
        self.assertIsNotNone(unwatch_command)
        
        # Configuration des mocks
        mock_has_admin.return_value = True
        link_info = MessageLinkInfo(self.guild.id, self.channel.id, self.message.id)
        mock_parse.return_value = link_info
        mock_reminder_mgr.get_reminder.return_value = self.event
        mock_reminder_mgr.remove_reminder.return_value = True
        
        await unwatch_command(self.ctx, "message_link")
        
        mock_reminder_mgr.remove_reminder.assert_called_once()
        mock_reschedule.assert_called_once()
        self.ctx.send.assert_called()

    @patch("commands.handlers.reminder_manager")
    async def test_list_command(self, mock_reminder_mgr):
        """Test commande /list."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande list
        list_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "list":
                list_command = command[0][0]
                break
        
        self.assertIsNotNone(list_command)
        
        # Configuration des mocks
        mock_reminder_mgr.get_guild_reminders.return_value = {"12345": self.event}
        
        await list_command(self.ctx)
        
        mock_reminder_mgr.get_guild_reminders.assert_called_once_with(self.ctx.guild.id)
        self.ctx.send.assert_called()

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.reminder_manager")
    @patch("commands.handlers.get_or_create_reminder_channel")
    @patch("commands.handlers.send_reminder")
    @patch("commands.handlers.Settings")
    async def test_remind_command(self, mock_settings, mock_send_reminder, 
                                 mock_get_channel, mock_reminder_mgr, mock_has_admin):
        """Test commande /remind."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande remind
        remind_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "remind":
                remind_command = command[0][0]
                break
        
        self.assertIsNotNone(remind_command)
        
        # Configuration des mocks
        mock_has_admin.return_value = True
        mock_settings.USE_SEPARATE_REMINDER_CHANNEL = False
        mock_settings.REMINDER_DELAY_SECONDS = 0
        mock_reminder_mgr.get_guild_reminders.return_value = {"12345": self.event}
        mock_send_reminder.return_value = 3
        
        await remind_command(self.ctx)
        
        mock_send_reminder.assert_called_once()
        self.ctx.send.assert_called()

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.create_health_embed")
    @patch("commands.handlers.get_concurrency_stats")
    @patch("commands.handlers.retry_stats")
    async def test_health_command(self, mock_retry_stats, mock_concurrency_stats,
                                 mock_create_health_embed, mock_has_admin):
        """Test commande /health."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande health
        health_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "health":
                health_command = command[0][0]
                break
        
        self.assertIsNotNone(health_command)
        
        # Configuration des mocks
        mock_has_admin.return_value = True
        mock_embed = Mock()
        mock_create_health_embed.return_value = mock_embed
        mock_concurrency_stats.return_value = {"active_tasks": 5}
        mock_retry_stats.get_stats.return_value = {"total_retries": 10}
        
        await health_command(self.ctx)
        
        mock_create_health_embed.assert_called_once()
        self.ctx.send.assert_called_with(embed=mock_embed)

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.sync_slash_commands")
    async def test_sync_command(self, mock_sync_slash, mock_has_admin):
        """Test commande /sync."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande sync
        sync_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "sync":
                sync_command = command[0][0]
                break
        
        self.assertIsNotNone(sync_command)
        
        mock_has_admin.return_value = True
        
        await sync_command(self.ctx)
        
        mock_sync_slash.assert_called_once_with(self.ctx)

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.get_backend_info")
    @patch("commands.handlers.event_manager_adapter")
    async def test_db_status_command(self, mock_adapter, mock_backend_info, mock_has_admin):
        """Test commande /db_status."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande db_status
        db_status_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "db_status":
                db_status_command = command[0][0]
                break
        
        self.assertIsNotNone(db_status_command)
        
        # Configuration des mocks
        mock_has_admin.return_value = True
        mock_backend_info.return_value = {
            "backend_type": "SQLite",
            "database_path": "/path/to/db.sqlite",
            "database_size": 2.5
        }
        mock_adapter.get_stats.return_value = {
            "total_events": 10,
            "active_events": 8,
            "paused_events": 2
        }
        
        await db_status_command(self.ctx)
        
        self.ctx.send.assert_called()

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.get_backend_info")
    @patch("commands.handlers.get_database")
    async def test_db_optimize_command(self, mock_get_db, mock_backend_info, mock_has_admin):
        """Test commande /db_optimize."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande db_optimize
        db_optimize_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "db_optimize":
                db_optimize_command = command[0][0]
                break
        
        self.assertIsNotNone(db_optimize_command)
        
        # Configuration des mocks
        mock_has_admin.return_value = True
        mock_backend_info.return_value = {
            "backend_type": "SQLite",
            "database_size": 2.0
        }
        
        mock_db = Mock()
        mock_db.execute_sql = Mock()
        mock_get_db.return_value = mock_db
        
        await db_optimize_command(self.ctx)
        
        # Vérifier que VACUUM et ANALYZE ont été exécutés
        calls = mock_db.execute_sql.call_args_list
        self.assertEqual(len(calls), 2)
        self.ctx.send.assert_called()

    @patch("commands.handlers.has_admin_permission")
    @patch("commands.handlers.get_backend_info")
    @patch("os.makedirs")
    @patch("shutil.copy2")
    @patch("os.path.getsize")
    async def test_db_backup_command(self, mock_getsize, mock_copy2, mock_makedirs,
                                    mock_backend_info, mock_has_admin):
        """Test commande /db_backup."""
        setup_bot_handlers(self.bot)
        
        # Récupérer la commande db_backup
        db_backup_command = None
        for command in self.bot.command.call_args_list:
            if command[1]["name"] == "db_backup":
                db_backup_command = command[0][0]
                break
        
        self.assertIsNotNone(db_backup_command)
        
        # Configuration des mocks
        mock_has_admin.return_value = True
        mock_backend_info.return_value = {
            "backend_type": "SQLite",
            "database_path": "discord_bot.db"
        }
        mock_getsize.return_value = 2097152  # 2 MB
        
        await db_backup_command(self.ctx)
        
        mock_makedirs.assert_called_once()
        mock_copy2.assert_called_once()
        self.ctx.send.assert_called()


if __name__ == "__main__":
    import unittest
    unittest.main()