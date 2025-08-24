"""
Unit tests for the validation utilities module.

This module tests all validation functions to ensure they work correctly
and provide proper error messages in French.
"""

import os
import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
import discord
from discord.ext import commands

# Import the module we're testing
from utils.validation import (
    validate_message_id,
    validate_message_link,
    validate_interval_minutes,
    validate_environment_config,
    validate_admin_roles_list,
    ValidationError,
    get_validation_error_embed,
    is_valid_discord_snowflake,
    safe_int_conversion
)


class TestValidateMessageId:
    """Tests for validate_message_id function."""
    
    def test_valid_message_ids(self):
        """Test that valid Discord message IDs pass validation."""
        # Valid Discord snowflake IDs
        valid_ids = [
            123456789012345678,  # Typical Discord message ID
            4194304,             # Minimum valid snowflake
            999999999999999999,  # Large valid ID
            "123456789012345678", # String that converts to valid ID
        ]
        
        for message_id in valid_ids:
            assert validate_message_id(message_id) == True
    
    def test_invalid_message_ids(self):
        """Test that invalid message IDs raise ValidationError."""
        invalid_ids = [
            0,                   # Zero
            -1,                  # Negative
            123,                 # Too small for Discord
            (1 << 63),           # Too large (overflow)
            "not_a_number",      # Non-numeric string
            None,                # None value
            [],                  # List
            {},                  # Dict
        ]
        
        for message_id in invalid_ids:
            with pytest.raises(ValidationError):
                validate_message_id(message_id)
    
    def test_error_messages_in_french(self):
        """Test that error messages are in French."""
        with pytest.raises(ValidationError) as exc_info:
            validate_message_id(-1)
        assert "positif" in str(exc_info.value)
        
        with pytest.raises(ValidationError) as exc_info:
            validate_message_id("invalid")
        assert "nombre valide" in str(exc_info.value)


class TestValidateMessageLink:
    """Tests for validate_message_link function."""
    
    @pytest.fixture
    def mock_bot(self):
        """Create a mock Discord bot for testing."""
        bot = Mock(spec=commands.Bot)
        
        # Mock guild
        guild = Mock(spec=discord.Guild)
        guild.id = 123456789
        guild.get_member = Mock(return_value=Mock(spec=discord.Member))
        
        # Mock channel
        channel = Mock(spec=discord.TextChannel)
        channel.id = 987654321
        channel.permissions_for = Mock(return_value=Mock(
            view_channel=True,
            read_message_history=True
        ))
        
        # Mock message
        message = Mock(spec=discord.Message)
        message.id = 555666777
        channel.fetch_message = AsyncMock(return_value=message)
        
        guild.get_channel = Mock(return_value=channel)
        bot.get_guild = Mock(return_value=guild)
        
        return bot
    
    @pytest.fixture
    def mock_user(self):
        """Create a mock Discord user for testing."""
        user = Mock(spec=discord.User)
        user.id = 111222333
        return user
    
    @pytest.mark.asyncio
    async def test_valid_message_link(self, mock_bot, mock_user):
        """Test validation of a valid Discord message link."""
        valid_link = "https://discord.com/channels/123456789/987654321/555666777"
        
        link_info = await validate_message_link(
            mock_bot, valid_link, mock_user
        )
        
        assert link_info is not None
        assert link_info.guild_id == 123456789
        assert link_info.channel_id == 987654321
        assert link_info.message_id == 555666777
    
    @pytest.mark.asyncio
    async def test_invalid_link_format(self, mock_bot, mock_user):
        """Test validation of invalid link formats."""
        invalid_links = [
            "not_a_link",
            "https://example.com/not-discord",
            "discord.com/channels/invalid/format",
            "",
        ]
        
        for link in invalid_links:
            with pytest.raises(ValidationError) as exc_info:
                await validate_message_link(
                    mock_bot, link, mock_user
                )
            
            assert "invalide" in str(exc_info.value).lower() or "format" in str(exc_info.value).lower()
    
    @pytest.mark.asyncio
    async def test_guild_not_found(self, mock_user):
        """Test handling when guild is not found."""
        bot = Mock(spec=commands.Bot)
        bot.get_guild = Mock(return_value=None)
        
        link = "https://discord.com/channels/123456789/987654321/555666777"
        
        with pytest.raises(ValidationError) as exc_info:
            await validate_message_link(
                bot, link, mock_user
            )
        
        assert "introuvable" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_no_permissions(self, mock_bot, mock_user):
        """Test handling when user has no permissions."""
        # Make user not a member of the guild
        guild = mock_bot.get_guild.return_value
        guild.get_member = Mock(return_value=None)
        
        link = "https://discord.com/channels/123456789/987654321/555666777"
        
        with pytest.raises(ValidationError) as exc_info:
            await validate_message_link(
                mock_bot, link, mock_user
            )
        
        assert "accès à ce serveur" in str(exc_info.value)


class TestValidateIntervalMinutes:
    """Tests for validate_interval_minutes function."""
    
    def test_valid_intervals_production(self):
        """Test valid intervals in production mode."""
        valid_intervals = [5, 30, 60, 720, 1440]
        
        for interval in valid_intervals:
            result = validate_interval_minutes(interval, test_mode=False)
            assert result == interval
    
    def test_valid_intervals_test_mode(self):
        """Test valid intervals in test mode."""
        valid_intervals = [1, 2, 30, 1440, 10080]
        
        for interval in valid_intervals:
            result = validate_interval_minutes(interval, test_mode=True)
            assert result == interval
    
    def test_interval_clamping_production(self):
        """Test that intervals are clamped to valid ranges in production."""
        # Too small - should be clamped to 5
        result = validate_interval_minutes(1, test_mode=False)
        assert result == 5
        
        # Too large - should be clamped to 1440
        result = validate_interval_minutes(2000, test_mode=False)
        assert result == 1440
    
    def test_interval_clamping_test_mode(self):
        """Test that intervals are clamped to valid ranges in test mode."""
        # Too small - should be clamped to 1
        result = validate_interval_minutes(0, test_mode=True)
        assert result == 1
        
        # Too large - should be clamped to 10080
        result = validate_interval_minutes(20000, test_mode=True)
        assert result == 10080
    
    def test_invalid_intervals(self):
        """Test that completely invalid intervals raise ValidationError."""
        invalid_intervals = [-1, "not_a_number", None, []]
        
        for interval in invalid_intervals:
            with pytest.raises(ValidationError):
                validate_interval_minutes(interval)
    
    def test_string_conversion(self):
        """Test that string intervals are properly converted."""
        result = validate_interval_minutes("60", test_mode=False)
        assert result == 60
        
        result = validate_interval_minutes("30.5", test_mode=False)
        assert result == 30  # Should be converted to int


class TestValidateEnvironmentConfig:
    """Tests for validate_environment_config function."""
    
    def test_valid_config(self):
        """Test that a valid configuration returns no errors."""
        env_vars = {
            'DISCORD_TOKEN': 'valid_token_that_is_long_enough_for_discord_' + 'x' * 20,
            'REMINDER_INTERVAL_HOURS': '24',
            'ADMIN_ROLES': 'Admin,Moderator,Coach',
            'USE_SEPARATE_REMINDER_CHANNEL': 'false',
            'LOG_LEVEL': 'INFO',
            'TEST_MODE': 'false',
        }
        
        with patch.dict(os.environ, env_vars, clear=True):
            errors = validate_environment_config()
            assert len(errors) == 0
    
    def test_missing_discord_token(self):
        """Test that missing Discord token is detected."""
        env_vars = {}
        
        with patch.dict(os.environ, env_vars, clear=True):
            errors = validate_environment_config()
            assert any('DISCORD_TOKEN' in error for error in errors)
    
    def test_invalid_reminder_interval(self):
        """Test that invalid reminder intervals are detected."""
        env_vars = {
            'DISCORD_TOKEN': 'valid_token_' + 'x' * 30,
            'REMINDER_INTERVAL_HOURS': '-5',
            'ADMIN_ROLES': 'Admin',
        }
        
        with patch.dict(os.environ, env_vars, clear=True):
            errors = validate_environment_config()
            assert any('REMINDER_INTERVAL_HOURS' in error and 'positif' in error for error in errors)
    
    def test_invalid_admin_roles(self):
        """Test that invalid admin roles are detected."""
        env_vars = {
            'DISCORD_TOKEN': 'valid_token_' + 'x' * 30,
            'ADMIN_ROLES': '',  # Empty roles
        }
        
        with patch.dict(os.environ, env_vars, clear=True):
            errors = validate_environment_config()
            assert any('ADMIN_ROLES' in error and 'vide' in error for error in errors)
    
    def test_invalid_log_level(self):
        """Test that invalid log levels are detected."""
        env_vars = {
            'DISCORD_TOKEN': 'valid_token_' + 'x' * 30,
            'LOG_LEVEL': 'INVALID_LEVEL',
            'ADMIN_ROLES': 'Admin',
        }
        
        with patch.dict(os.environ, env_vars, clear=True):
            errors = validate_environment_config()
            assert any('LOG_LEVEL' in error for error in errors)


class TestValidateAdminRolesList:
    """Tests for validate_admin_roles_list function."""
    
    def test_valid_roles_list(self):
        """Test that valid admin roles pass validation."""
        valid_roles = ['Admin', 'Moderator', 'Coach']
        # Should not raise exception for valid roles
        validate_admin_roles_list(valid_roles)
    
    def test_empty_roles_list(self):
        """Test that empty roles list fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            validate_admin_roles_list([])
        assert 'vide' in str(exc_info.value)
    
    def test_roles_with_forbidden_characters(self):
        """Test that roles with forbidden characters fail validation."""
        invalid_roles = ['Role@WithAt', 'Role#WithHash', 'Role:WithColon']
        
        for roles in [[role] for role in invalid_roles]:
            with pytest.raises(ValidationError) as exc_info:
                validate_admin_roles_list(roles)
            assert 'interdits' in str(exc_info.value)
    
    def test_too_long_role_names(self):
        """Test that overly long role names fail validation."""
        long_role = 'x' * 101  # Over 100 characters
        with pytest.raises(ValidationError) as exc_info:
            validate_admin_roles_list([long_role])
        assert 'trop long' in str(exc_info.value)


class TestUtilityFunctions:
    """Tests for utility validation functions."""
    
    def test_is_valid_discord_snowflake(self):
        """Test the snowflake validation utility function."""
        assert is_valid_discord_snowflake(123456789012345678) == True
        assert is_valid_discord_snowflake("123456789012345678") == True
        assert is_valid_discord_snowflake(-1) == False
        assert is_valid_discord_snowflake("invalid") == False
    
    def test_safe_int_conversion(self):
        """Test the safe integer conversion function."""
        # Valid conversions
        assert safe_int_conversion("123", "test field") == 123
        assert safe_int_conversion(456, "test field") == 456
        
        # Invalid conversions should raise ValidationError
        with pytest.raises(ValidationError) as exc_info:
            safe_int_conversion("not_a_number", "test field")
        assert "test field" in str(exc_info.value)
        assert "nombre entier" in str(exc_info.value)
    
    def test_get_validation_error_embed(self):
        """Test that validation error embeds are created correctly."""
        error = ValidationError("Test error message", "Technical details")
        embed = get_validation_error_embed(error, "Test Title")
        
        assert embed.title == "Test Title"
        assert embed.description == "Test error message"
        assert embed.color == discord.Color.red()
        
        # Check that fields are added
        assert len(embed.fields) > 0
        assert any(field.name == "💡 Aide" for field in embed.fields)


class TestIntegration:
    """Integration tests combining multiple validation functions."""
    
    @pytest.mark.asyncio
    async def test_full_message_validation_flow(self):
        """Test the complete message validation flow."""
        # Mock bot setup
        bot = Mock(spec=commands.Bot)
        guild = Mock(spec=discord.Guild)
        channel = Mock(spec=discord.TextChannel)
        message = Mock(spec=discord.Message)
        user = Mock(spec=discord.User)
        
        # Setup mocks
        bot.get_guild.return_value = guild
        guild.get_channel.return_value = channel
        guild.get_member.return_value = Mock(spec=discord.Member)
        channel.permissions_for.return_value = Mock(
            view_channel=True,
            read_message_history=True
        )
        channel.fetch_message = AsyncMock(return_value=message)
        
        # Test valid link
        valid_link = "https://discord.com/channels/123456789012345678/987654321012345678/555666777012345678"
        link_info = await validate_message_link(bot, valid_link, user)
        
        assert link_info is not None
        
        # Validate the extracted IDs
        assert validate_message_id(link_info.guild_id) == True
        assert validate_message_id(link_info.channel_id) == True
        assert validate_message_id(link_info.message_id) == True
    
    def test_environment_and_interval_validation_integration(self):
        """Test integration between environment and interval validation."""
        # Test that test mode affects interval validation
        env_vars = {
            'DISCORD_TOKEN': 'valid_token_' + 'x' * 50,
            'REMINDER_INTERVAL_HOURS': '0.5',  # 30 minutes, enables test mode
            'ADMIN_ROLES': 'Admin',
            'TEST_MODE': 'true',
        }
        
        with patch.dict(os.environ, env_vars, clear=True):
            # Environment should be valid
            errors = validate_environment_config()
            assert len(errors) == 0
            
            # Test mode interval validation should allow 1 minute
            result = validate_interval_minutes(1, test_mode=True)
            assert result == 1
            
            # Production mode would clamp it to 5
            result = validate_interval_minutes(1, test_mode=False)
            assert result == 5


if __name__ == '__main__':
    # Run tests when script is executed directly
    pytest.main([__file__, '-v'])