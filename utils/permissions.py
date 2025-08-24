"""
Permission management utilities for Discord Reminder Bot.

This module provides functions to check user permissions and roles
for accessing admin commands.
"""

import logging
from typing import List, Union

import discord
from discord.ext import commands

from config.settings import Settings

# Get logger for this module
logger = logging.getLogger(__name__)


def has_admin_permission(
    user: Union[discord.Member, discord.User], admin_roles: List[str] = None
) -> bool:
    """
    Check if a user has administrator permissions for bot commands.

    A user is considered to have admin permissions if:
    1. They have Discord server administrator permissions, OR
    2. They have one of the roles specified in admin_roles

    Args:
        user: Discord member or user to check permissions for
        admin_roles: List of role names that grant admin access (uses config default if None)

    Returns:
        bool: True if user has admin permissions, False otherwise
    """
    # Use default admin roles from config if none provided
    if admin_roles is None:
        admin_roles = Settings.ADMIN_ROLES

    # Check if user is a Member (has guild permissions) vs just User
    if not isinstance(user, discord.Member):
        logger.debug(f"User {user.display_name} is not a guild member, denying admin access")
        return False

    # Check Discord administrator permissions
    if user.guild_permissions.administrator:
        logger.debug(f"User {user.display_name} has Discord administrator permissions")
        return True

    # Check if user has any of the admin roles
    user_role_names = [role.name for role in user.roles]
    for admin_role in admin_roles:
        if admin_role in user_role_names:
            logger.debug(f"User {user.display_name} has admin role: {admin_role}")
            return True

    logger.debug(f"User {user.display_name} does not have admin permissions")
    return False


async def check_admin_permission(ctx: commands.Context) -> bool:
    """
    Check if the command context author has admin permissions.

    This is a convenience function for use in Discord command handlers.

    Args:
        ctx: Discord command context

    Returns:
        bool: True if the author has admin permissions, False otherwise
    """
    return has_admin_permission(ctx.author)


def get_permission_error_message(admin_roles: List[str] = None) -> str:
    """
    Get a standardized permission error message.

    Args:
        admin_roles: List of admin role names (uses config default if None)

    Returns:
        str: Formatted error message indicating required roles
    """
    if admin_roles is None:
        admin_roles = Settings.ADMIN_ROLES

    return f"❌ Vous devez avoir l'un de ces rôles: {', '.join(admin_roles)}"


class AdminRequired:
    """
    Decorator class for checking admin permissions on commands.

    Usage:
        @bot.command()
        @AdminRequired()
        async def admin_command(ctx):
            # Command implementation
    """

    def __init__(self, admin_roles: List[str] = None):
        """
        Initialize the admin permission checker.

        Args:
            admin_roles: List of role names that grant admin access
        """
        self.admin_roles = admin_roles

    def __call__(self, func):
        """
        Decorator function that wraps the command to check permissions.

        Args:
            func: The command function to wrap

        Returns:
            The wrapped function with permission checking
        """

        async def wrapper(ctx: commands.Context, *args, **kwargs):
            if not has_admin_permission(ctx.author, self.admin_roles):
                await ctx.send(get_permission_error_message(self.admin_roles))
                return

            return await func(ctx, *args, **kwargs)

        return wrapper
